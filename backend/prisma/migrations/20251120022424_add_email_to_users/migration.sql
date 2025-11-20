-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "receive_notifications" BOOLEAN NOT NULL DEFAULT false;
