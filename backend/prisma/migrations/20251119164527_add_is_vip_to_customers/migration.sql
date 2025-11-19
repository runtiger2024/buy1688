-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "is_vip" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "specs" TEXT[];
