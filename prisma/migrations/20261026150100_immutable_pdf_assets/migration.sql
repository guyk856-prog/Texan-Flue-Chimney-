CREATE FUNCTION protect_issued_pdf_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "DocumentVersion" WHERE "pdfFileId" = OLD.id AND "issuedAt" IS NOT NULL) THEN
   RAISE EXCEPTION 'Issued PDF FileAsset is immutable' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER issued_pdf_asset_immutable BEFORE UPDATE OR DELETE ON "FileAsset"
FOR EACH ROW EXECUTE FUNCTION protect_issued_pdf_asset();
