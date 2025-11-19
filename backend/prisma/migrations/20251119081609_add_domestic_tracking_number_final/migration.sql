/*
  Warnings:

  - You are about to drop the column `image_url` on the `products` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[share_token]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - The required column `share_token` was added to the `orders` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "domestic_tracking_number" TEXT,
ADD COLUMN     "payment_voucher_url" TEXT,
ADD COLUMN     "share_token" TEXT NOT NULL,
ADD COLUMN     "warehouse_id" INTEGER;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "image_url",
ADD COLUMN     "images" TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "orders_share_token_key" ON "orders"("share_token");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
