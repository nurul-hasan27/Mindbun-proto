-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "PreferenceKind" AS ENUM ('PREFERENCE', 'REQUIREMENT');

-- CreateEnum
CREATE TYPE "MatchSentiment" AS ENUM ('GOOD', 'MIXED', 'POOR');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "therapists" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "therapists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "therapist_profiles" (
    "id" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "yearsOfExperience" INTEGER NOT NULL,

    CONSTRAINT "therapist_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "therapeutic_approaches" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "therapeutic_approaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas_of_work" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "areas_of_work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_styles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "communication_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contextual_experiences" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "contextual_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_formats" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "session_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_windows" (
    "id" UUID NOT NULL,
    "therapistProfileId" UUID NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "availability_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_preferences" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "kind" "PreferenceKind" NOT NULL DEFAULT 'PREFERENCE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_availability" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "timezone" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "client_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intakes" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "rawText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "sentiment" "MatchSentiment" NOT NULL,
    "reasonId" UUID,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_reasons" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "feedback_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LanguageToTherapistProfile" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_LanguageToTherapistProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TherapeuticApproachToTherapistProfile" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_TherapeuticApproachToTherapistProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AreaOfWorkToTherapistProfile" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AreaOfWorkToTherapistProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AreaOfWorkToClientPreference" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AreaOfWorkToClientPreference_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CommunicationStyleToTherapistProfile" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_CommunicationStyleToTherapistProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ContextualExperienceToTherapistProfile" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ContextualExperienceToTherapistProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_SessionFormatToTherapistProfile" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_SessionFormatToTherapistProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ClientPreferenceToLanguage" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ClientPreferenceToLanguage_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ClientPreferenceToCommunicationStyle" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ClientPreferenceToCommunicationStyle_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ClientPreferenceToTherapeuticApproach" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ClientPreferenceToTherapeuticApproach_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ClientPreferenceToContextualExperience" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ClientPreferenceToContextualExperience_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ClientPreferenceToSessionFormat" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ClientPreferenceToSessionFormat_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "therapist_profiles_therapistId_key" ON "therapist_profiles"("therapistId");

-- CreateIndex
CREATE INDEX "therapist_profiles_displayName_idx" ON "therapist_profiles"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "therapeutic_approaches_key_key" ON "therapeutic_approaches"("key");

-- CreateIndex
CREATE UNIQUE INDEX "areas_of_work_key_key" ON "areas_of_work"("key");

-- CreateIndex
CREATE UNIQUE INDEX "communication_styles_key_key" ON "communication_styles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "contextual_experiences_key_key" ON "contextual_experiences"("key");

-- CreateIndex
CREATE UNIQUE INDEX "session_formats_key_key" ON "session_formats"("key");

-- CreateIndex
CREATE INDEX "availability_windows_therapistProfileId_dayOfWeek_idx" ON "availability_windows"("therapistProfileId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "client_preferences_clientId_idx" ON "client_preferences"("clientId");

-- CreateIndex
CREATE INDEX "client_availability_clientId_dayOfWeek_idx" ON "client_availability"("clientId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "intakes_clientId_createdAt_idx" ON "intakes"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_clientId_createdAt_idx" ON "feedback"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_therapistId_idx" ON "feedback"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_reasons_key_key" ON "feedback_reasons"("key");

-- CreateIndex
CREATE INDEX "_LanguageToTherapistProfile_B_index" ON "_LanguageToTherapistProfile"("B");

-- CreateIndex
CREATE INDEX "_TherapeuticApproachToTherapistProfile_B_index" ON "_TherapeuticApproachToTherapistProfile"("B");

-- CreateIndex
CREATE INDEX "_AreaOfWorkToTherapistProfile_B_index" ON "_AreaOfWorkToTherapistProfile"("B");

-- CreateIndex
CREATE INDEX "_AreaOfWorkToClientPreference_B_index" ON "_AreaOfWorkToClientPreference"("B");

-- CreateIndex
CREATE INDEX "_CommunicationStyleToTherapistProfile_B_index" ON "_CommunicationStyleToTherapistProfile"("B");

-- CreateIndex
CREATE INDEX "_ContextualExperienceToTherapistProfile_B_index" ON "_ContextualExperienceToTherapistProfile"("B");

-- CreateIndex
CREATE INDEX "_SessionFormatToTherapistProfile_B_index" ON "_SessionFormatToTherapistProfile"("B");

-- CreateIndex
CREATE INDEX "_ClientPreferenceToLanguage_B_index" ON "_ClientPreferenceToLanguage"("B");

-- CreateIndex
CREATE INDEX "_ClientPreferenceToCommunicationStyle_B_index" ON "_ClientPreferenceToCommunicationStyle"("B");

-- CreateIndex
CREATE INDEX "_ClientPreferenceToTherapeuticApproach_B_index" ON "_ClientPreferenceToTherapeuticApproach"("B");

-- CreateIndex
CREATE INDEX "_ClientPreferenceToContextualExperience_B_index" ON "_ClientPreferenceToContextualExperience"("B");

-- CreateIndex
CREATE INDEX "_ClientPreferenceToSessionFormat_B_index" ON "_ClientPreferenceToSessionFormat"("B");

-- AddForeignKey
ALTER TABLE "therapist_profiles" ADD CONSTRAINT "therapist_profiles_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_therapistProfileId_fkey" FOREIGN KEY ("therapistProfileId") REFERENCES "therapist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_preferences" ADD CONSTRAINT "client_preferences_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_availability" ADD CONSTRAINT "client_availability_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "feedback_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LanguageToTherapistProfile" ADD CONSTRAINT "_LanguageToTherapistProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LanguageToTherapistProfile" ADD CONSTRAINT "_LanguageToTherapistProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "therapist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TherapeuticApproachToTherapistProfile" ADD CONSTRAINT "_TherapeuticApproachToTherapistProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "therapeutic_approaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TherapeuticApproachToTherapistProfile" ADD CONSTRAINT "_TherapeuticApproachToTherapistProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "therapist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaOfWorkToTherapistProfile" ADD CONSTRAINT "_AreaOfWorkToTherapistProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "areas_of_work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaOfWorkToTherapistProfile" ADD CONSTRAINT "_AreaOfWorkToTherapistProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "therapist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaOfWorkToClientPreference" ADD CONSTRAINT "_AreaOfWorkToClientPreference_A_fkey" FOREIGN KEY ("A") REFERENCES "areas_of_work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaOfWorkToClientPreference" ADD CONSTRAINT "_AreaOfWorkToClientPreference_B_fkey" FOREIGN KEY ("B") REFERENCES "client_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CommunicationStyleToTherapistProfile" ADD CONSTRAINT "_CommunicationStyleToTherapistProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "communication_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CommunicationStyleToTherapistProfile" ADD CONSTRAINT "_CommunicationStyleToTherapistProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "therapist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContextualExperienceToTherapistProfile" ADD CONSTRAINT "_ContextualExperienceToTherapistProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "contextual_experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContextualExperienceToTherapistProfile" ADD CONSTRAINT "_ContextualExperienceToTherapistProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "therapist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SessionFormatToTherapistProfile" ADD CONSTRAINT "_SessionFormatToTherapistProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "session_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SessionFormatToTherapistProfile" ADD CONSTRAINT "_SessionFormatToTherapistProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "therapist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToLanguage" ADD CONSTRAINT "_ClientPreferenceToLanguage_A_fkey" FOREIGN KEY ("A") REFERENCES "client_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToLanguage" ADD CONSTRAINT "_ClientPreferenceToLanguage_B_fkey" FOREIGN KEY ("B") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToCommunicationStyle" ADD CONSTRAINT "_ClientPreferenceToCommunicationStyle_A_fkey" FOREIGN KEY ("A") REFERENCES "client_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToCommunicationStyle" ADD CONSTRAINT "_ClientPreferenceToCommunicationStyle_B_fkey" FOREIGN KEY ("B") REFERENCES "communication_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToTherapeuticApproach" ADD CONSTRAINT "_ClientPreferenceToTherapeuticApproach_A_fkey" FOREIGN KEY ("A") REFERENCES "client_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToTherapeuticApproach" ADD CONSTRAINT "_ClientPreferenceToTherapeuticApproach_B_fkey" FOREIGN KEY ("B") REFERENCES "therapeutic_approaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToContextualExperience" ADD CONSTRAINT "_ClientPreferenceToContextualExperience_A_fkey" FOREIGN KEY ("A") REFERENCES "client_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToContextualExperience" ADD CONSTRAINT "_ClientPreferenceToContextualExperience_B_fkey" FOREIGN KEY ("B") REFERENCES "contextual_experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToSessionFormat" ADD CONSTRAINT "_ClientPreferenceToSessionFormat_A_fkey" FOREIGN KEY ("A") REFERENCES "client_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientPreferenceToSessionFormat" ADD CONSTRAINT "_ClientPreferenceToSessionFormat_B_fkey" FOREIGN KEY ("B") REFERENCES "session_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
