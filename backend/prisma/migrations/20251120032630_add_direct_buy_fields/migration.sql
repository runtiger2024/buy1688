-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "recipient_address" TEXT,
ADD COLUMN     "recipient_name" TEXT,
ADD COLUMN     "recipient_phone" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_direct_buy" BOOLEAN NOT NULL DEFAULT false;
