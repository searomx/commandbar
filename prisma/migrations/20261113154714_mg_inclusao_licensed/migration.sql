-- CreateTable
CREATE TABLE "Licensed" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "address" VARCHAR(50) NOT NULL,
    "number" VARCHAR(10) NOT NULL,
    "zipCode" VARCHAR(10) NOT NULL,
    "district" VARCHAR(50) NOT NULL,
    "city" VARCHAR(50) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "cnpj" VARCHAR(20) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(50) NOT NULL,
    "contactName" VARCHAR(50) NOT NULL,
    "logoMarca" VARCHAR(255) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "Licensed_pkey" PRIMARY KEY ("id")
);
