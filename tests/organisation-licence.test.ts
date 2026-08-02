import { describe, expect, it } from "vitest";
import {
  assertPractitionerSeatAvailable,
  buildPractitionerSeatSummary,
  countPractitionerSeatsInUse,
  formatSeatsInUseLabel,
  memberConsumesPractitionerSeat,
  NO_PRACTITIONER_SEAT_AVAILABLE_MESSAGE,
  LICENCE_NOT_ACTIVE_MESSAGE,
  assignmentWouldNewlyConsumeSeat,
} from "@/lib/organisations/licence";

describe("practitioner seat consumption", () => {
  it("always counts active practitioners", () => {
    expect(
      memberConsumesPractitionerSeat({
        role: "practitioner",
        status: "active",
        hasPractitionerAccess: false,
        hasActiveRelationshipAssignment: false,
      })
    ).toBe(true);
  });

  it("does not count deactivated practitioners", () => {
    expect(
      memberConsumesPractitionerSeat({
        role: "practitioner",
        status: "deactivated",
        hasPractitionerAccess: false,
        hasActiveRelationshipAssignment: false,
      })
    ).toBe(false);
  });

  it("does not count admin-only owners without assignments", () => {
    expect(
      memberConsumesPractitionerSeat({
        role: "owner",
        status: "active",
        hasPractitionerAccess: false,
        hasActiveRelationshipAssignment: false,
      })
    ).toBe(false);
  });

  it("counts owners with practitioner access or active assignments", () => {
    expect(
      memberConsumesPractitionerSeat({
        role: "owner",
        status: "active",
        hasPractitionerAccess: true,
        hasActiveRelationshipAssignment: false,
      })
    ).toBe(true);
    expect(
      memberConsumesPractitionerSeat({
        role: "administrator",
        status: "active",
        hasPractitionerAccess: false,
        hasActiveRelationshipAssignment: true,
      })
    ).toBe(true);
  });

  it("counts oversight members only when assigned", () => {
    expect(
      memberConsumesPractitionerSeat({
        role: "oversight",
        status: "active",
        hasPractitionerAccess: false,
        hasActiveRelationshipAssignment: false,
      })
    ).toBe(false);
    expect(
      memberConsumesPractitionerSeat({
        role: "oversight",
        status: "active",
        hasPractitionerAccess: false,
        hasActiveRelationshipAssignment: true,
      })
    ).toBe(true);
  });

  it("never counts viewers", () => {
    expect(
      memberConsumesPractitionerSeat({
        role: "viewer",
        status: "active",
        hasPractitionerAccess: true,
        hasActiveRelationshipAssignment: true,
      })
    ).toBe(false);
  });

  it("aggregates seats in use across memberships and assignments", () => {
    const inUse = countPractitionerSeatsInUse(
      [
        { userId: "p1", role: "practitioner", status: "active" },
        { userId: "owner", role: "owner", status: "active" },
        { userId: "admin", role: "administrator", status: "active" },
        { userId: "oversight", role: "oversight", status: "active" },
        { userId: "viewer", role: "viewer", status: "active" },
        { userId: "old", role: "practitioner", status: "deactivated" },
      ],
      [
        {
          userId: "owner",
          assignmentRole: "primary",
          status: "active",
        },
        {
          userId: "oversight",
          assignmentRole: "supervisor",
          status: "active",
        },
        {
          userId: "admin",
          assignmentRole: "cover",
          status: "ended",
        },
      ]
    );
    // practitioner + assigned owner + assigned oversight
    expect(inUse).toBe(3);
  });

  it("formats the seats label clearly", () => {
    expect(
      formatSeatsInUseLabel(
        buildPractitionerSeatSummary({ seatsPurchased: 5, seatsInUse: 3 })
      )
    ).toBe("3 of 5 in use");
  });

  it("blocks activation when no seats remain", () => {
    expect(
      assertPractitionerSeatAvailable({
        licenceStatus: "active",
        seatsPurchased: 2,
        seatsInUse: 2,
        wouldNewlyConsumeSeat: true,
      })
    ).toBe(NO_PRACTITIONER_SEAT_AVAILABLE_MESSAGE);

    expect(
      assertPractitionerSeatAvailable({
        licenceStatus: "active",
        seatsPurchased: 2,
        seatsInUse: 2,
        wouldNewlyConsumeSeat: false,
      })
    ).toBeNull();
  });

  it("blocks activation when licence is not usable", () => {
    expect(
      assertPractitionerSeatAvailable({
        licenceStatus: "expired",
        seatsPurchased: 5,
        seatsInUse: 1,
        wouldNewlyConsumeSeat: true,
      })
    ).toBe(LICENCE_NOT_ACTIVE_MESSAGE);
  });

  it("detects when an assignment would newly consume a seat", () => {
    expect(
      assignmentWouldNewlyConsumeSeat({
        role: "owner",
        status: "active",
        alreadyConsumesSeat: false,
      })
    ).toBe(true);
    expect(
      assignmentWouldNewlyConsumeSeat({
        role: "practitioner",
        status: "active",
        alreadyConsumesSeat: false,
      })
    ).toBe(false);
    expect(
      assignmentWouldNewlyConsumeSeat({
        role: "owner",
        status: "active",
        alreadyConsumesSeat: true,
      })
    ).toBe(false);
  });
});
