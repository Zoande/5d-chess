import {openSync, fsyncSync, closeSync} from 'node:fs'

/** Persist directory entries where supported; Windows cannot open directories
 * like Unix. File fsync still runs on every platform. Real I/O failures surface. */
export function syncDirectory(path: string): void {
  let fd: number | undefined
  try {fd=openSync(path,'r'); fsyncSync(fd)}
  catch (error) {
    if (!['EINVAL','ENOTSUP','EISDIR','EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
  } finally {if (fd !== undefined) closeSync(fd)}
}
