import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import type { User } from "../api/types";

const authState: { user: User | null; loading: boolean } = { user: null, loading: false };
vi.mock("./AuthContext", () => ({ useAuth: () => authState }));

import { RequireAdmin, RequireAuth, RequireVerified } from "./guards";

const base: User = {
  id: "1",
  email: "a@b.com",
  name: "A",
  role: "investor",
  verification_status: "unverified",
  verification_note: "",
};

function renderAt(element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route path="/secret" element={element} />
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/verification" element={<p>verification page</p>} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  it("RequireAuth sends anonymous visitors to login", () => {
    authState.user = null;
    renderAt(<RequireAuth><p>secret</p></RequireAuth>);
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("RequireVerified sends unverified investors to verification", () => {
    authState.user = { ...base, verification_status: "pending" };
    renderAt(<RequireVerified><p>secret</p></RequireVerified>);
    expect(screen.getByText("verification page")).toBeInTheDocument();
  });

  it("RequireVerified lets verified investors through", () => {
    authState.user = { ...base, verification_status: "verified" };
    renderAt(<RequireVerified><p>secret</p></RequireVerified>);
    expect(screen.getByText("secret")).toBeInTheDocument();
  });

  it("RequireAdmin blocks investors and allows admins", () => {
    authState.user = { ...base, verification_status: "verified" };
    const { unmount } = renderAt(<RequireAdmin><p>secret</p></RequireAdmin>);
    expect(screen.getByText("home page")).toBeInTheDocument();
    unmount();
    authState.user = { ...base, role: "admin", verification_status: "verified" };
    renderAt(<RequireAdmin><p>secret</p></RequireAdmin>);
    expect(screen.getByText("secret")).toBeInTheDocument();
  });
});
