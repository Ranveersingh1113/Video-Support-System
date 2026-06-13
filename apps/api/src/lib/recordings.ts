import type { Recording } from '@prisma/client'
import { prisma } from './prisma.js'
import { egressClient } from './livekit.js'

export function recordingStatusFromEgress(status: number): 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED' {
  if (status === 0 || status === 1) return 'RECORDING'
  if (status === 2) return 'PROCESSING'
  if (status === 3) return 'READY'
  return 'FAILED'
}

export async function reconcileRecording(recording: Recording): Promise<Recording> {
  if (!recording.egressId || recording.status === 'READY' || recording.status === 'FAILED') {
    return recording
  }
  try {
    const [info] = await egressClient.listEgress({ egressId: recording.egressId })
    if (!info) return recording
    const status = recordingStatusFromEgress(info.status)
    return prisma.recording.update({
      where: { id: recording.id },
      data: {
        status,
        stoppedAt: status === 'PROCESSING' || status === 'READY' || status === 'FAILED'
          ? recording.stoppedAt ?? new Date()
          : undefined,
        readyAt: status === 'READY' ? recording.readyAt ?? new Date() : undefined,
        error: status === 'FAILED' ? info.error || info.details || 'LiveKit egress failed or aborted' : null,
      },
    })
  } catch {
    return recording
  }
}

export async function stopActiveRecordings(sessionId: string): Promise<void> {
  const active = await prisma.recording.findMany({
    where: { sessionId, status: 'RECORDING' },
  })
  for (const recording of active) {
    await prisma.recording.update({
      where: { id: recording.id },
      data: { status: 'PROCESSING', stoppedAt: new Date() },
    })
    if (recording.egressId) {
      try {
        await egressClient.stopEgress(recording.egressId)
      } catch {
        // Egress may already be ending because the room closed.
      }
    }
  }
}
