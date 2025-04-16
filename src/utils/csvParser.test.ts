import { describe, it, expect } from "vitest";
import { parseContactsCSV } from "./csvParser";

// Helper to create base64 encoded CSV string
const toBase64 = (str: string) => Buffer.from(str).toString("base64");

describe("parseContactsCSV", () => {
  it("should parse valid CSV with phone_number and first_name", () => {
    const csvContent = `phone_number,first_name\n1234567890,Alice\n0987654321,Bob`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(0);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0]).toEqual({ phoneNumber: "1234567890@c.us", firstName: "Alice" });
    expect(result.contacts[1]).toEqual({ phoneNumber: "0987654321@c.us", firstName: "Bob" });
  });

  it("should parse valid CSV with only phone_number", () => {
    const csvContent = `phone_number\n1112223333\n4445556666`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(0);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0]).toEqual({ phoneNumber: "1112223333@c.us" });
    expect(result.contacts[1]).toEqual({ phoneNumber: "4445556666@c.us" });
  });

   it("should handle different header casing and spacing", () => {
    const csvContent = ` Phone_Number , First_Name \n1234567890, Alice \n 0987654321 ,Bob`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(0);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0]).toEqual({ phoneNumber: "1234567890@c.us", firstName: "Alice" });
    expect(result.contacts[1]).toEqual({ phoneNumber: "0987654321@c.us", firstName: "Bob" });
  });

  it("should return error if phone_number header is missing", () => {
    const csvContent = `first_name\nAlice\nBob`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Missing required header 'phone_number'");
    expect(result.contacts).toHaveLength(0);
  });

  it("should skip rows with missing phone_number and report error", () => {
    const csvContent = `phone_number,first_name\n,Alice\n1234567890,Bob\n   ,Charlie`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("Row 2: Missing 'phone_number'");
    expect(result.errors[1]).toContain("Row 4: Missing 'phone_number'");
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual({ phoneNumber: "1234567890@c.us", firstName: "Bob" });
  });

  it("should skip rows with invalid phone number format and report error", () => {
    const csvContent = `phone_number,first_name\n12345,TooShort\n1234567890,Valid\n1234567890123456,TooLong\nabcdefghij,NotDigits`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain("Row 2: Invalid phone number format for '12345'");
    expect(result.errors[1]).toContain("Row 4: Invalid phone number format for '1234567890123456'");
    expect(result.errors[2]).toContain("Row 5: Invalid phone number format for 'abcdefghij'");
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual({ phoneNumber: "1234567890@c.us", firstName: "Valid" });
  });

  it("should ignore extra columns", () => {
    const csvContent = `phone_number,first_name,extra_col\n1234567890,Alice,ignoreme`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(0);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual({ phoneNumber: "1234567890@c.us", firstName: "Alice" });
  });

  it("should handle empty rows", () => {
    const csvContent = `phone_number,first_name\n1234567890,Alice\n\n0987654321,Bob`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(0); // PapaParse skipEmptyLines handles this
    expect(result.contacts).toHaveLength(2);
  });

  it("should handle empty CSV content", () => {
    const csvContent = ``;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    // PapaParse might report an error or just return no data depending on exact empty input
    // Expecting no contacts is the main thing. Header check might also fail.
    expect(result.contacts).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1); // Expect at least the header error
    expect(result.errors.some(e => e.includes("Missing required header 'phone_number'"))).toBe(true);
  });

   it("should handle CSV with only headers", () => {
    const csvContent = `phone_number,first_name`;
    const base64Content = toBase64(csvContent);
    const result = parseContactsCSV(base64Content);

    expect(result.errors).toHaveLength(0);
    expect(result.contacts).toHaveLength(0);
  });

  it("should return error for invalid base64 input", () => {
    const invalidBase64 = "this is not base64";
    const result = parseContactsCSV(invalidBase64);

    // Invalid base64 might lead to empty/garbage content, causing header validation to fail
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Missing required header 'phone_number'");
    expect(result.contacts).toHaveLength(0);
  });

  // Note: Testing specific PapaParse errors like unclosed quotes might be brittle.
  // The current checks for headers and row data cover most practical validation needs.
});