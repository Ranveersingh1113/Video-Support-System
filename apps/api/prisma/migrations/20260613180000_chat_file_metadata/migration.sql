ALTER TABLE "ChatMessage"
ADD COLUMN "fileName" TEXT,
ADD COLUMN "fileMime" TEXT,
ADD COLUMN "fileSize" INTEGER,
ADD COLUMN "fileStorageKey" TEXT;
