import { expect, test, type Page } from "@playwright/test";
import { E2E_CUSTOMERS, E2E_PASSWORD, E2E_USERS } from "./fixtures";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
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
  await expect(page.getByText(E2E_USERS.saleB.fullName, { exact: true })).toBeVisible();
});
