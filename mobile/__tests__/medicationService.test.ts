import { getToken, logout } from "@/services/authService";
import {
  MedicationError,
  createMedication,
  deleteMedication,
  listMedications,
  updateMedication,
} from "@/services/medicationService";

jest.mock("@/services/authService", () => ({
  getToken: jest.fn(),
  logout: jest.fn(async () => undefined),
}));

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

const API_MEDICATION = {
  id: "med-1",
  name: "Placebofen",
  dosage: "10 mg",
  frequency: "twice daily",
  prescribing_doctor: "Dr. Imaginary",
  refill_date: "2026-09-10",
  notes: null,
  refill_due_soon: true,
  refill_overdue: false,
  days_until_refill: 3,
};

function respond(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("medicationService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockedGetToken.mockReturnValue("fake-token");
  });

  it("sends the bearer token with every request", async () => {
    respond(200, [API_MEDICATION]);

    await listMedications();

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer fake-token");
  });

  it("refuses to call the API when there is no token", async () => {
    mockedGetToken.mockReturnValue(null);

    const error = await listMedications().catch((e) => e);

    expect(error).toBeInstanceOf(MedicationError);
    expect(error.isAuthError).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("maps API fields into camelCase", async () => {
    respond(200, [API_MEDICATION]);

    const [medication] = await listMedications();

    expect(medication).toEqual({
      id: "med-1",
      name: "Placebofen",
      dosage: "10 mg",
      frequency: "twice daily",
      prescribingDoctor: "Dr. Imaginary",
      refillDate: "2026-09-10",
      notes: null,
      quantityRemaining: null,
      quantityCountedOn: null,
      dosesPerDay: null,
      refillDueSoon: true,
      refillOverdue: false,
      daysUntilRefill: 3,
      refillEstimate: {
        runOutOn: null,
        daysRemaining: null,
        alert: false,
        isEstimate: false,
        dosesPerDay: null,
        dosesPerDaySource: null,
        reason: null,
        leadDays: 0,
      },
    });
  });

  it("offers no estimate rather than crashing when the server has not got one", async () => {
    // The web build is deployed separately from the API, so a client can
    // outrun its backend by one restart. A medication list that threw on a
    // missing field would be a blank screen for whoever hit that window.
    respond(200, [API_MEDICATION]);

    const [medication] = await listMedications();

    expect(medication.refillEstimate.isEstimate).toBe(false);
    expect(medication.refillEstimate.alert).toBe(false);
  });

  it("asks the server to compute the estimate against the device's lead time", async () => {
    // The lead time is a device setting (`appSettings.ts`), and the server
    // owns the arithmetic — so it travels on the request rather than being
    // applied on either side alone.
    respond(200, []);

    await listMedications(7);

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("refill_lead_days=7");
  });

  it("sends snake_case field names when creating", async () => {
    respond(201, API_MEDICATION);

    await createMedication({
      name: "Placebofen",
      dosage: "10 mg",
      prescribingDoctor: "Dr. Imaginary",
      refillDate: "2026-09-10",
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/medications");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "Placebofen",
      dosage: "10 mg",
      frequency: null,
      prescribing_doctor: "Dr. Imaginary",
      refill_date: "2026-09-10",
      notes: null,
      quantity_remaining: null,
      quantity_counted_on: null,
      doses_per_day: null,
    });
  });

  it("puts to the record's own URL when updating", async () => {
    respond(200, API_MEDICATION);

    await updateMedication("med-1", { name: "Renamed" });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/medications/med-1");
    expect(init.method).toBe("PUT");
  });

  it("handles the empty 204 body when deleting", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("no body");
      },
    });

    await expect(deleteMedication("med-1")).resolves.toBeUndefined();
  });

  it("reports an expired session distinctly so the app can send the user to sign in", async () => {
    respond(401, { detail: "Sign in to continue." });

    const error = await listMedications().catch((e) => e);

    expect(error.isAuthError).toBe(true);
    expect(error.message).toMatch(/session has expired/i);
    // The refused token is dropped, so a reload does not restore a dead
    // session and land the user back on a screen that cannot load.
    expect(logout).toHaveBeenCalled();
  });

  it("reports an unreachable server as a network error", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const error = await listMedications().catch((e) => e);

    expect(error.isNetworkError).toBe(true);
  });

  it("surfaces the server's validation message", async () => {
    respond(422, {
      detail: [{ msg: "Value error, Enter the medication name.", loc: ["body", "name"] }],
    });

    await expect(createMedication({ name: "" })).rejects.toThrow(
      "Enter the medication name."
    );
  });
});
