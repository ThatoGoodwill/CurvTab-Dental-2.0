-- Safe to run more than once. Creates the table behind Scheduling / Billing / Clinical settings.
CREATE TABLE IF NOT EXISTS "PracticeConfigurations" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "DentalPracticeId" uuid NOT NULL,
    "OpeningHoursJson" character varying(1000) NOT NULL DEFAULT '',
    "SlotMinutes" integer NOT NULL DEFAULT 30,
    "BufferMinutes" integer NOT NULL DEFAULT 0,
    "AdvanceBookingDays" integer NOT NULL DEFAULT 90,
    "CancellationNoticeHours" integer NOT NULL DEFAULT 24,
    "InvoicePrefix" character varying(10) NOT NULL DEFAULT 'INV',
    "VatRatePercent" numeric(5,2) NOT NULL DEFAULT 15,
    "PaymentTermsDays" integer NOT NULL DEFAULT 7,
    "InvoiceFooter" character varying(300) NOT NULL DEFAULT '',
    "DefaultAppointmentMinutes" integer NOT NULL DEFAULT 30,
    "RequireToothForProcedure" boolean NOT NULL DEFAULT true,
    "ConsentRequiredBeforeTreatment" boolean NOT NULL DEFAULT true,
    "DefaultRecallMonths" integer NOT NULL DEFAULT 6,
    "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now(),
    "UpdatedByUserId" uuid NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "IX_PracticeConfigurations_DentalPracticeId"
    ON "PracticeConfigurations" ("DentalPracticeId");
