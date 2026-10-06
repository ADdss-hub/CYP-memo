/**
 * Linux systemd Type=notify：监听成功后通告 READY=1。
 * 无 NOTIFY_SOCKET（本机/Windows）则忽略。
 */
import net from 'node:net'

export function notifySystemdReady(): void {
  const sock = process.env.NOTIFY_SOCKET
  if (!sock) return
  const payload = Buffer.from('READY=1\n')
  try {
    const path = sock.startsWith('@') ? `\0${sock.slice(1)}` : sock
    const client = net.createConnection({ path })
    client.on('error', () => {
      try {
        client.destroy()
      } catch {
        /* ignore */
      }
    })
    client.write(payload, () => {
      client.end()
    })
  } catch {
    /* 非 systemd 环境忽略 */
  }
}
