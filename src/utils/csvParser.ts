import Papa from "papaparse";

export interface ParsedContact {
  phoneNumber: string;
  firstName?: string;
}

export interface ParseResult {
  contacts: ParsedContact[];
  errors: string[];
}

// Basic phone number validation (digits only, 7-15 length)
const PHONE_REGEX = /^\d{7,15}$/;

/**
 * Parses a CSV file content (base64 encoded) to extract contact information.
 * Validates headers and phone number format.
 * Formats phone numbers to number@c.us.
 *
 * @param fileContentBase64 - The base64 encoded content of the CSV file.
 * @returns An object containing the list of parsed contacts and any errors encountered.
 */
export function parseContactsCSV(fileContentBase64: string): ParseResult {
  const contacts: ParsedContact[] = [];
  const errors: string[] = [];

  try {
    const csvContent = Buffer.from(fileContentBase64, "base64").toString("utf-8");

    const result = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      delimiter: ",", // Explicitly set delimiter
      transformHeader: (header) => header.trim().toLowerCase(),
    });

    if (result.errors.length > 0) {
      result.errors.forEach((err, index) => {
        errors.push(`CSV Parsing Error (Row ${err.row ?? index + 2}): ${err.message}`);
      });
      // Return early if basic parsing failed significantly
      if (!result.data || result.data.length === 0) {
         return { contacts, errors };
      }
    }

    const headers = result.meta.fields;
    if (!headers || !headers.includes("phone_number")) {
      errors.push("CSV header validation failed: Missing required header 'phone_number'.");
      return { contacts, errors }; // Cannot proceed without phone_number
    }

    (result.data as Record<string, string>[]).forEach((row, index) => {
      const rowNumber = index + 2; // +1 for header row, +1 for 0-based index
      const rawPhoneNumber = row.phone_number?.trim();
      const firstName = row.first_name?.trim();

      if (!rawPhoneNumber) {
        errors.push(`Row ${rowNumber}: Missing 'phone_number'.`);
        return; // Skip this row
      }

      if (!PHONE_REGEX.test(rawPhoneNumber)) {
        errors.push(`Row ${rowNumber}: Invalid phone number format for '${rawPhoneNumber}'. Must be 7-15 digits.`);
        return; // Skip this row
      }

      const formattedPhoneNumber = `${rawPhoneNumber}@c.us`;

      const contact: ParsedContact = { phoneNumber: formattedPhoneNumber };
      if (firstName) {
        contact.firstName = firstName;
      }
      contacts.push(contact);
    });

  } catch (error) {
     if (error instanceof Error) {
       errors.push(`An unexpected error occurred during CSV processing: ${error.message}`);
     } else {
       errors.push("An unexpected error occurred during CSV processing.");
     }
  }

  return { contacts, errors };
}