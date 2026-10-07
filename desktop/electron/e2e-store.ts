import type * as Signal from '@signalapp/libsignal-client';

/**
 * libsignal's five stores, over one plain object.
 *
 * Everything is held as base64 of what libsignal serialised, which is what
 * makes the whole thing writable to a single file and readable back without
 * knowing anything about the shapes inside. The file itself is encrypted by the
 * caller — see `e2e.ts`; this module deliberately knows nothing about disks.
 *
 * The classes are built inside a function rather than declared at the top level
 * because their base classes arrive at runtime: libsignal is an ES module and
 * Electron's Node cannot `require` one, so it is imported dynamically and there
 * is nothing to extend until that resolves. The type import above is erased at
 * build time and pulls in no code.
 *
 * Hard rule 4: none of this invents cryptography. Every record here was
 * produced by libsignal and is handed straight back to it.
 */

export interface StoredState {
  identityKey: string;
  registrationId: number;
  /** Address string -> serialised record. */
  sessions: Record<string, string>;
  identities: Record<string, string>;
  preKeys: Record<string, string>;
  signedPreKeys: Record<string, string>;
  kyberPreKeys: Record<string, string>;
  /** Ids handed out so far, so a rotation never reuses one. */
  nextPreKeyId: number;
  nextSignedPreKeyId: number;
  nextKyberPreKeyId: number;
}

export function blankState(identityKey: string, registrationId: number): StoredState {
  return {
    identityKey,
    registrationId,
    sessions: {},
    identities: {},
    preKeys: {},
    signedPreKeys: {},
    kyberPreKeys: {},
    nextPreKeyId: 1,
    nextSignedPreKeyId: 1,
    nextKyberPreKeyId: 1,
  };
}

const b64 = (input: Uint8Array): string => Buffer.from(input).toString('base64');

/**
 * `Uint8Array.from` rather than the Buffer itself: a Buffer may be backed by a
 * SharedArrayBuffer, and libsignal's signatures ask for a plain one.
 */
const raw = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(Buffer.from(value, 'base64'));

export interface Stores {
  sessions: Signal.SessionStore;
  identities: Signal.IdentityKeyStore;
  preKeys: Signal.PreKeyStore;
  signedPreKeys: Signal.SignedPreKeyStore;
  kyberPreKeys: Signal.KyberPreKeyStore;
}

export function storesOver(signal: typeof Signal, state: StoredState): Stores {
  const sessions = new (class extends signal.SessionStore {
    async saveSession(name: Signal.ProtocolAddress, record: Signal.SessionRecord): Promise<void> {
      state.sessions[name.toString()] = b64(record.serialize());
    }

    async getSession(name: Signal.ProtocolAddress): Promise<Signal.SessionRecord | null> {
      const stored = state.sessions[name.toString()];
      return stored ? signal.SessionRecord.deserialize(raw(stored)) : null;
    }

    async getExistingSessions(
      addresses: Signal.ProtocolAddress[],
    ): Promise<Signal.SessionRecord[]> {
      return addresses.map((address) => {
        const stored = state.sessions[address.toString()];
        // libsignal asks only for sessions it believes exist; a miss here is a
        // bug in the caller and returning an empty record would hide it.
        if (!stored) throw new Error(`No session for ${address.toString()}`);
        return signal.SessionRecord.deserialize(raw(stored));
      });
    }
  })();

  const identities = new (class extends signal.IdentityKeyStore {
    async getIdentityKey(): Promise<Signal.PrivateKey> {
      return signal.PrivateKey.deserialize(raw(state.identityKey));
    }

    async getLocalRegistrationId(): Promise<number> {
      return state.registrationId;
    }

    async saveIdentity(
      name: Signal.ProtocolAddress,
      key: Signal.PublicKey,
    ): Promise<Signal.IdentityChange> {
      const address = name.toString();
      const known = state.identities[address];
      const incoming = b64(key.serialize());
      state.identities[address] = incoming;

      return known && known !== incoming
        ? signal.IdentityChange.ReplacedExisting
        : signal.IdentityChange.NewOrUnchanged;
    }

    /**
     * Trust on first use, and after that the key has to stay what it was.
     *
     * A changed identity is exactly what an interception looks like, so it is
     * refused rather than accepted quietly.
     */
    async isTrustedIdentity(
      name: Signal.ProtocolAddress,
      key: Signal.PublicKey,
    ): Promise<boolean> {
      const known = state.identities[name.toString()];
      return !known || known === b64(key.serialize());
    }

    async getIdentity(name: Signal.ProtocolAddress): Promise<Signal.PublicKey | null> {
      const stored = state.identities[name.toString()];
      return stored ? signal.PublicKey.deserialize(raw(stored)) : null;
    }
  })();

  const preKeys = new (class extends signal.PreKeyStore {
    async savePreKey(id: number, record: Signal.PreKeyRecord): Promise<void> {
      state.preKeys[String(id)] = b64(record.serialize());
    }

    async getPreKey(id: number): Promise<Signal.PreKeyRecord> {
      const stored = state.preKeys[String(id)];
      if (!stored) throw new Error(`No prekey ${id}`);
      return signal.PreKeyRecord.deserialize(raw(stored));
    }

    /** Called by libsignal once used; a prekey is single-use by design. */
    async removePreKey(id: number): Promise<void> {
      delete state.preKeys[String(id)];
    }
  })();

  const signedPreKeys = new (class extends signal.SignedPreKeyStore {
    async saveSignedPreKey(id: number, record: Signal.SignedPreKeyRecord): Promise<void> {
      state.signedPreKeys[String(id)] = b64(record.serialize());
    }

    async getSignedPreKey(id: number): Promise<Signal.SignedPreKeyRecord> {
      const stored = state.signedPreKeys[String(id)];
      if (!stored) throw new Error(`No signed prekey ${id}`);
      return signal.SignedPreKeyRecord.deserialize(raw(stored));
    }
  })();

  const kyberPreKeys = new (class extends signal.KyberPreKeyStore {
    async saveKyberPreKey(id: number, record: Signal.KyberPreKeyRecord): Promise<void> {
      state.kyberPreKeys[String(id)] = b64(record.serialize());
    }

    async getKyberPreKey(id: number): Promise<Signal.KyberPreKeyRecord> {
      const stored = state.kyberPreKeys[String(id)];
      if (!stored) throw new Error(`No kyber prekey ${id}`);
      return signal.KyberPreKeyRecord.deserialize(raw(stored));
    }

    /**
     * Kept rather than deleted on use: the last-resort key is reused by design,
     * and libsignal marks rather than removes it.
     */
    async markKyberPreKeyUsed(): Promise<void> {}
  })();

  return { sessions, identities, preKeys, signedPreKeys, kyberPreKeys };
}
