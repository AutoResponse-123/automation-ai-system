-- Google Sheets integration
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sheets_refresh_token   TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sheets_spreadsheet_id  TEXT;
