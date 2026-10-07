import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Object storage through the S3 API so the beta's MinIO can be swapped for a
 * hosted bucket by changing configuration, not code (spec section 9).
 */
export const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
  // MinIO serves buckets as a path segment, not a hostname.
  forcePathStyle: true,
});

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET }));
    logger.info({ bucket: config.S3_BUCKET }, 'bucket created');
  }
}

/**
 * Keys are namespaced per owner and carry a random component, so one user can
 * never guess or overwrite another's object even if the bucket were listed.
 */
export function buildKey(userId: string, filename: string): string {
  const safe = filename.replace(/[^\w.-]/g, '_').slice(-64);
  return `u/${userId}/${randomUUID()}/${safe}`;
}

export async function putObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}

/**
 * Downloads go through a short-lived signed URL rather than a public bucket.
 * Used where the caller can reach the storage host itself; on the beta nobody
 * outside the compose network can, which is what `getObject` below is for.
 */
export function signDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

/**
 * The object as a stream, for handing straight to a client that cannot reach
 * storage on its own.
 *
 * This process was meant to stay out of the way of file bytes, and a redirect
 * to a signed URL is the better shape when it works. On the beta it does not:
 * MinIO sits on the internal compose network with no published port and no
 * route through Caddy, so the redirect pointed every client at a hostname it
 * could not resolve. Streaming keeps the bucket private and costs a socket,
 * not a buffer — nothing here reads the file into memory.
 */
export async function getObject(key: string): Promise<{
  body: Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
}> {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  return {
    body: res.Body as Readable,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
  };
}
