-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OFFICE', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "ApplianceType" AS ENUM ('WOOD_FIREPLACE', 'WOOD_STOVE', 'INSERT', 'PREFAB_FACTORY_BUILT', 'DRYER_VENT', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('LEAD', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ESTIMATE', 'INVOICE', 'INSPECTION', 'DRYER_VENT_REPORT', 'RECEIPT', 'WORK_ORDER', 'WORK_AUTHORIZATION', 'CHANGE_ORDER', 'COMPLETION_ACK', 'STATEMENT', 'INSURANCE_SCOPE', 'APPROVAL_CERTIFICATE');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'READY', 'SENT', 'VIEWED', 'APPROVED', 'DECLINED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'ZELLE', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'TECH_SIGNED', 'FINALIZED', 'SHARED');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('PASS', 'FAIL', 'NA', 'NOT_INSPECTED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'MONITOR', 'REPAIR_RECOMMENDED', 'URGENT');

-- CreateEnum
CREATE TYPE "InspectionKind" AS ENUM ('CHIMNEY', 'DRYER_VENT');

-- CreateEnum
CREATE TYPE "PhotoPhase" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'AUTHORIZED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureAction" AS ENUM ('APPROVE', 'DECLINE', 'ACKNOWLEDGE', 'WORK_AUTHORIZE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "AIRequestKind" AS ENUM ('EXTRACT_DOCUMENT', 'DRAFT_SCOPE', 'DRAFT_FINDING', 'REWRITE', 'TRANSLATE', 'SUGGEST_FROM_PHOTO');

-- CreateEnum
CREATE TYPE "AIRequestStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "addrLine1" TEXT NOT NULL,
    "addrLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal" TEXT NOT NULL,
    "logoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxLabel" TEXT NOT NULL DEFAULT 'Tax',
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "feeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "feeLabel" TEXT NOT NULL DEFAULT 'Service Fee',
    "feeRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "estimateSignatureRequired" BOOLEAN NOT NULL DEFAULT false,
    "workAuthRequired" BOOLEAN NOT NULL DEFAULT false,
    "shareTokenTtlHours" INTEGER NOT NULL DEFAULT 336,
    "estimateValidDays" INTEGER NOT NULL DEFAULT 30,
    "invoiceNetDays" INTEGER NOT NULL DEFAULT 14,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiProvider" "AiProvider",
    "aiModel" TEXT,
    "aiMonthlyCentsCap" INTEGER NOT NULL DEFAULT 5000,
    "defaultTerms" TEXT,
    "defaultExclusions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mfaSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "billLine1" TEXT,
    "billLine2" TEXT,
    "billCity" TEXT,
    "billState" TEXT,
    "billPostal" TEXT,
    "preferredLang" TEXT NOT NULL DEFAULT 'en',
    "notes" TEXT,
    "tags" TEXT[],
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal" TEXT NOT NULL,
    "accessNotes" TEXT,
    "gateCode" TEXT,
    "chimneyNotes" TEXT,
    "applianceType" "ApplianceType",
    "storeys" INTEGER,
    "roofType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'LEAD',
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "accessNotes" TEXT,
    "safetyNotes" TEXT,
    "internalNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianAssignment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCatalogItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scopeSteps" TEXT[],
    "materials" TEXT[],
    "exclusions" TEXT[],
    "unit" TEXT NOT NULL DEFAULT 'each',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyDefinedTerm" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePriceVersion" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePriceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT,
    "templateVersionId" TEXT,
    "pdfFileId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentShareToken" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "depositRequestCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "terms" TEXT,
    "exclusions" TEXT,
    "assumptions" TEXT,
    "warrantyTerms" TEXT,
    "customerNote" TEXT,
    "internalNote" TEXT,
    "validUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "serviceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "lineTotalCents" INTEGER NOT NULL,
    "note" TEXT,
    "aiExtractionId" TEXT,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "jobId" TEXT,
    "sourceEstimateId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "paymentInstructions" TEXT,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "lineTotalCents" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "jobId" TEXT,
    "technicianId" TEXT NOT NULL,
    "kind" "InspectionKind" NOT NULL DEFAULT 'CHIMNEY',
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "performedAt" TIMESTAMP(3) NOT NULL,
    "applianceType" "ApplianceType",
    "weather" TEXT,
    "limitations" TEXT,
    "summary" TEXT,
    "recommendations" TEXT,
    "techSignedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionSection" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InspectionSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionFinding" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'NOT_INSPECTED',
    "severity" "Severity",
    "observation" TEXT,
    "recommendation" TEXT,
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InspectionFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionPhoto" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,
    "pairKey" TEXT,
    "phase" "PhotoPhase",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InspectionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" TEXT NOT NULL,
    "materials" TEXT[],
    "safetyNotes" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "workPerformed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deltaCents" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerPhone" TEXT,
    "imageFileId" TEXT,
    "typedName" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,
    "shareTokenId" TEXT,
    "action" "SignatureAction" NOT NULL,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signerName" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRequest" (
    "id" TEXT NOT NULL,
    "kind" "AIRequestKind" NOT NULL,
    "status" "AIRequestStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "AiProvider",
    "model" TEXT,
    "instruction" TEXT,
    "sourceFileId" TEXT,
    "estimateId" TEXT,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "costCents" INTEGER,
    "error" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AIRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIExtraction" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" INTEGER,
    "warnings" TEXT[],
    "unknownFields" TEXT[],
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,

    CONSTRAINT "AIExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LineItemPhotos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LineItemPhotos_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PropertyPhotos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PropertyPhotos_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_JobPhotos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_JobPhotos_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ServicePhotos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ServicePhotos_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Customer_organizationId_name_idx" ON "Customer"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Customer_organizationId_phone_idx" ON "Customer"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "Customer_organizationId_email_idx" ON "Customer"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Property_customerId_idx" ON "Property"("customerId");

-- CreateIndex
CREATE INDEX "Property_postal_idx" ON "Property"("postal");

-- CreateIndex
CREATE UNIQUE INDEX "Job_number_key" ON "Job"("number");

-- CreateIndex
CREATE INDEX "Job_organizationId_status_idx" ON "Job"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Job_customerId_idx" ON "Job"("customerId");

-- CreateIndex
CREATE INDEX "Appointment_jobId_startsAt_idx" ON "Appointment"("jobId", "startsAt");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_userId_idx" ON "TechnicianAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianAssignment_jobId_userId_key" ON "TechnicianAssignment"("jobId", "userId");

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_organizationId_category_idx" ON "ServiceCatalogItem"("organizationId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalogItem_organizationId_slug_key" ON "ServiceCatalogItem"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ServicePriceVersion_serviceId_effectiveFrom_idx" ON "ServicePriceVersion"("serviceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Document_organizationId_type_idx" ON "Document"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_type_number_key" ON "Document"("organizationId", "type", "number");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_organizationId_type_version_key" ON "TemplateVersion"("organizationId", "type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShareToken_tokenHash_key" ON "DocumentShareToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DocumentShareToken_documentId_idx" ON "DocumentShareToken"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_documentId_key" ON "Estimate"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_supersededById_key" ON "Estimate"("supersededById");

-- CreateIndex
CREATE INDEX "Estimate_customerId_status_idx" ON "Estimate"("customerId", "status");

-- CreateIndex
CREATE INDEX "Estimate_status_idx" ON "Estimate"("status");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_sortOrder_idx" ON "EstimateLineItem"("estimateId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_documentId_key" ON "Invoice"("documentId");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_sortOrder_idx" ON "InvoiceLineItem"("invoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "PaymentRecord_invoiceId_idx" ON "PaymentRecord"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_documentId_key" ON "Receipt"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_documentId_key" ON "Inspection"("documentId");

-- CreateIndex
CREATE INDEX "Inspection_customerId_idx" ON "Inspection"("customerId");

-- CreateIndex
CREATE INDEX "Inspection_technicianId_performedAt_idx" ON "Inspection"("technicianId", "performedAt");

-- CreateIndex
CREATE INDEX "InspectionSection_inspectionId_sortOrder_idx" ON "InspectionSection"("inspectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "InspectionFinding_sectionId_sortOrder_idx" ON "InspectionFinding"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "InspectionPhoto_findingId_sortOrder_idx" ON "InspectionPhoto"("findingId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_documentId_key" ON "WorkOrder"("documentId");

-- CreateIndex
CREATE INDEX "WorkOrder_jobId_idx" ON "WorkOrder"("jobId");

-- CreateIndex
CREATE INDEX "ChangeOrder_workOrderId_idx" ON "ChangeOrder"("workOrderId");

-- CreateIndex
CREATE INDEX "Signature_documentVersionId_idx" ON "Signature"("documentVersionId");

-- CreateIndex
CREATE INDEX "ConsentRecord_documentVersionId_idx" ON "ConsentRecord"("documentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "FileAsset_sha256_idx" ON "FileAsset"("sha256");

-- CreateIndex
CREATE INDEX "EmailDelivery_documentId_idx" ON "EmailDelivery"("documentId");

-- CreateIndex
CREATE INDEX "AIRequest_status_idx" ON "AIRequest"("status");

-- CreateIndex
CREATE INDEX "AIRequest_createdAt_idx" ON "AIRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AIExtraction_requestId_idx" ON "AIExtraction"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceCounter_organizationId_type_year_key" ON "SequenceCounter"("organizationId", "type", "year");

-- CreateIndex
CREATE INDEX "ActivityLog_entity_entityId_idx" ON "ActivityLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "_LineItemPhotos_B_index" ON "_LineItemPhotos"("B");

-- CreateIndex
CREATE INDEX "_PropertyPhotos_B_index" ON "_PropertyPhotos"("B");

-- CreateIndex
CREATE INDEX "_JobPhotos_B_index" ON "_JobPhotos"("B");

-- CreateIndex
CREATE INDEX "_ServicePhotos_B_index" ON "_ServicePhotos"("B");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCatalogItem" ADD CONSTRAINT "ServiceCatalogItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePriceVersion" ADD CONSTRAINT "ServicePriceVersion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareToken" ADD CONSTRAINT "DocumentShareToken_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_aiExtractionId_fkey" FOREIGN KEY ("aiExtractionId") REFERENCES "AIExtraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourceEstimateId_fkey" FOREIGN KEY ("sourceEstimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSection" ADD CONSTRAINT "InspectionSection_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionFinding" ADD CONSTRAINT "InspectionFinding_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "InspectionSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "InspectionFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExtraction" ADD CONSTRAINT "AIExtraction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AIRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceCounter" ADD CONSTRAINT "SequenceCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LineItemPhotos" ADD CONSTRAINT "_LineItemPhotos_A_fkey" FOREIGN KEY ("A") REFERENCES "EstimateLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LineItemPhotos" ADD CONSTRAINT "_LineItemPhotos_B_fkey" FOREIGN KEY ("B") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PropertyPhotos" ADD CONSTRAINT "_PropertyPhotos_A_fkey" FOREIGN KEY ("A") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PropertyPhotos" ADD CONSTRAINT "_PropertyPhotos_B_fkey" FOREIGN KEY ("B") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobPhotos" ADD CONSTRAINT "_JobPhotos_A_fkey" FOREIGN KEY ("A") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobPhotos" ADD CONSTRAINT "_JobPhotos_B_fkey" FOREIGN KEY ("B") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServicePhotos" ADD CONSTRAINT "_ServicePhotos_A_fkey" FOREIGN KEY ("A") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServicePhotos" ADD CONSTRAINT "_ServicePhotos_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
