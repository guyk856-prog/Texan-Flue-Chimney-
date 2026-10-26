-- Once issued, the version payload, PDF link and hash are immutable even to raw SQL.
CREATE FUNCTION protect_issued_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."issuedAt" IS NOT NULL THEN
   RAISE EXCEPTION 'Issued DocumentVersion is immutable' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER issued_document_version_immutable BEFORE UPDATE OR DELETE ON "DocumentVersion"
FOR EACH ROW EXECUTE FUNCTION protect_issued_document_version();
