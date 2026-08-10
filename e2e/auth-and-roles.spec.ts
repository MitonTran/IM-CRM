import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { E2E_CUSTOMERS, E2E_PASSWORD, E2E_RECOVERY_PASSWORD, E2E_TEAMS, E2E_USERS } from "./fixtures";

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function expectManagementSaved(page: Page, message: string) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("status")).toHaveText(message);
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu ${name} cho E2E local.`);
  return value;
}

test("khách chưa đăng nhập bị đưa về trang đăng nhập", async ({ page }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Đăng nhập IM CRM" })).toBeVisible();
});

test("đăng nhập sai trả thông báo chung", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("unknown.e2e@example.invalid");
  await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Email hoặc mật khẩu chưa đúng.", { exact: true })).toBeVisible();
});

test("recovery token cho phép đặt mật khẩu mới rồi đăng nhập lại", async ({ page }) => {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) || process.env.E2E_LOCAL_ONLY !== "true") {
    throw new Error("Từ chối tạo recovery token ngoài Supabase local.");
  }
  const admin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const generated = await admin.auth.admin.generateLink({ type: "recovery", email: E2E_USERS.saleB.email });
  if (generated.error || !generated.data.properties?.hashed_token) throw new Error("Không tạo được recovery token E2E local.");

  await page.goto(`/auth/confirm?token_hash=${encodeURIComponent(generated.data.properties.hashed_token)}&type=recovery&next=/auth/update-password`);
  await expect(page).toHaveURL(/\/auth\/update-password/);
  await page.getByLabel("Mật khẩu mới").fill(E2E_RECOVERY_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu").fill(E2E_RECOVERY_PASSWORD);
  await page.getByRole("button", { name: /Lưu mật khẩu/ }).click();
  await expect(page).toHaveURL(/\/login\?status=password-updated/);
  await expect(page.getByText("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập ngay.", { exact: true })).toBeVisible();

  await page.getByLabel("Email").fill(E2E_USERS.saleB.email);
  await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Email hoặc mật khẩu chưa đúng.", { exact: true })).toBeVisible();
  await login(page, E2E_USERS.saleB.email, E2E_RECOVERY_PASSWORD);
});

test("Sale chỉ thấy khách được giao cho mình và không vào trang quản trị", async ({ page }) => {
  await login(page, E2E_USERS.saleA.email);
  await expect(page.getByText(E2E_USERS.saleA.fullName, { exact: true })).toBeVisible();
  await expect(page.getByText("Nhân sự & team", { exact: true })).toHaveCount(0);
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Khách hàng" })).toBeVisible();
  await expect(page.getByText(E2E_CUSTOMERS.saleA.name, { exact: true })).toBeVisible();
  await expect(page.getByText(E2E_CUSTOMERS.saleB.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText(E2E_CUSTOMERS.unassignedA.name, { exact: true })).toHaveCount(0);
  await page.goto("/admin/people");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("Leader thấy đúng dữ liệu team và các dashboard quản lý", async ({ page }) => {
  await login(page, E2E_USERS.leaderA.email);
  await expect(page.getByText(E2E_USERS.leaderA.fullName, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bảng hiệu suất" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đặt mục tiêu KPI" })).toBeVisible();
  await page.goto("/customers");
  await expect(page.getByText(E2E_CUSTOMERS.saleA.name, { exact: true })).toBeVisible();
  await expect(page.getByText(E2E_CUSTOMERS.unassignedA.name, { exact: true })).toBeVisible();
  await expect(page.getByText(E2E_CUSTOMERS.saleB.name, { exact: true })).toHaveCount(0);
});

test("Admin thấy toàn hệ thống và trang nhân sự", async ({ page }) => {
  await login(page, E2E_USERS.admin.email);
  await expect(page.getByText(E2E_USERS.admin.fullName, { exact: true })).toBeVisible();
  await expect(page.getByText("Nhân sự & team", { exact: true })).toBeVisible();
  await page.goto("/customers");
  await expect(page.getByText(E2E_CUSTOMERS.saleA.name, { exact: true })).toBeVisible();
  await expect(page.getByText(E2E_CUSTOMERS.saleB.name, { exact: true })).toBeVisible();
  await expect(page.getByText(E2E_CUSTOMERS.unassignedA.name, { exact: true })).toBeVisible();
  await page.goto("/admin/people");
  await expect(page.getByRole("heading", { name: "Nhân sự & team" })).toBeVisible();
  await expect(page.getByRole("article", { name: `Quản lý thành viên ${E2E_USERS.saleB.fullName}` })).toBeVisible();

  const renamedTeam = "Team Trống Đã Đổi E2E";
  const teamCard = page.getByRole("article", { name: `Quản lý team ${E2E_TEAMS.empty.name}` });
  await teamCard.getByLabel(`Tên ${E2E_TEAMS.empty.name}`).fill(renamedTeam);
  await teamCard.getByRole("button", { name: "Lưu tên" }).click();
  await expectManagementSaved(page, "Đã lưu tên và trạng thái team.");
  const renamedTeamCard = page.getByRole("article", { name: `Quản lý team ${renamedTeam}` });
  await renamedTeamCard.getByRole("button", { name: "Ngừng" }).click();
  await expectManagementSaved(page, "Đã lưu tên và trạng thái team.");
  const stoppedTeamCard = page.getByRole("article", { name: `Quản lý team ${renamedTeam}` });
  await expect(stoppedTeamCard.getByText("Ngừng hoạt động", { exact: true })).toBeVisible();
  await stoppedTeamCard.getByRole("button", { name: "Kích hoạt" }).click();
  await expectManagementSaved(page, "Đã lưu tên và trạng thái team.");

  const leaderCard = page.getByRole("article", { name: `Quản lý thành viên ${E2E_USERS.leaderB.fullName}` });
  await leaderCard.getByLabel("Họ tên thành viên").fill("Leader B Đã Đổi E2E");
  await leaderCard.getByRole("button", { name: "Lưu", exact: true }).click();
  await expectManagementSaved(page, "Đã lưu hồ sơ và trạng thái thành viên.");
  const renamedLeaderCard = page.getByRole("article", { name: "Quản lý thành viên Leader B Đã Đổi E2E" });
  await renamedLeaderCard.getByRole("button", { name: "Khóa" }).click();
  await expectManagementSaved(page, "Đã lưu hồ sơ và trạng thái thành viên.");
  const lockedLeaderCard = page.getByRole("article", { name: "Quản lý thành viên Leader B Đã Đổi E2E" });
  await expect(lockedLeaderCard.getByText("Không hoạt động", { exact: true })).toBeVisible();
  await lockedLeaderCard.getByRole("button", { name: "Kích hoạt" }).click();
  await expectManagementSaved(page, "Đã lưu hồ sơ và trạng thái thành viên.");
});
