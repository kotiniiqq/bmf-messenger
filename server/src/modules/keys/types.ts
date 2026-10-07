export interface DeviceKeyRow {
  deviceId: string;
  userId: string;
  registrationId: number;
  identityKey: string;
  signedPrekeyId: number;
  signedPrekey: string;
  signedPrekeySig: string;
  kyberPrekeyId: number;
  kyberPrekey: string;
  kyberPrekeySig: string;
  updatedAt: Date;
}

export interface OneTimePreKeyRow {
  deviceId: string;
  keyId: number;
  key: string;
  claimedAt: Date | null;
}
