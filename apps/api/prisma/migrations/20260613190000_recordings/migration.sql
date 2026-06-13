CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "Recording" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "egressId" TEXT,
  "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
  "fileName" TEXT NOT NULL,
  "filePath" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stoppedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Recording_egressId_key" ON "Recording"("egressId");
CREATE INDEX "Recording_sessionId_idx" ON "Recording"("sessionId");

ALTER TABLE "Recording"
ADD CONSTRAINT "Recording_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
