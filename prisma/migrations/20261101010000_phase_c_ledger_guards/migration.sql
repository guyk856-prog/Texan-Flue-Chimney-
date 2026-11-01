CREATE FUNCTION validate_receipt_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "PaymentRecord" p WHERE p.id=NEW."paymentId" AND p."invoiceId"=NEW."invoiceId" AND p."reversedAt" IS NULL) THEN
   RAISE EXCEPTION 'Receipt requires a matching non-reversed payment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER receipt_requires_received_payment BEFORE INSERT ON "Receipt" FOR EACH ROW EXECUTE FUNCTION validate_receipt_payment();

CREATE FUNCTION protect_payment_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment records cannot be deleted' USING ERRCODE='23514'; END IF;
 IF OLD."reversedAt" IS NOT NULL OR (to_jsonb(NEW)-'reversedAt'-'reversedReason') IS DISTINCT FROM (to_jsonb(OLD)-'reversedAt'-'reversedReason') THEN
   RAISE EXCEPTION 'Payment facts are immutable; only a first reversal is allowed' USING ERRCODE='23514';
 END IF;
 IF NEW."reversedAt" IS NULL OR coalesce(trim(NEW."reversedReason"),'')='' THEN
   RAISE EXCEPTION 'Reversal requires a timestamp and reason' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER payment_facts_immutable BEFORE UPDATE OR DELETE ON "PaymentRecord" FOR EACH ROW EXECUTE FUNCTION protect_payment_record();
CREATE FUNCTION protect_append_only_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit, signature and consent records are append-only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER signature_append_only BEFORE UPDATE OR DELETE ON "Signature" FOR EACH ROW EXECUTE FUNCTION protect_append_only_record();
CREATE TRIGGER consent_append_only BEFORE UPDATE OR DELETE ON "ConsentRecord" FOR EACH ROW EXECUTE FUNCTION protect_append_only_record();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION protect_append_only_record();
