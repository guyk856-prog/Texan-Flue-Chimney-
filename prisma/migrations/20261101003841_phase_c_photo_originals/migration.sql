-- AlterTable
ALTER TABLE "InspectionPhoto" ADD COLUMN     "originalFileId" TEXT;

-- AddForeignKey
ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_originalFileId_fkey" FOREIGN KEY ("originalFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
