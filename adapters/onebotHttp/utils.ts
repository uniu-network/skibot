import { SkiUserRole } from "../../app/roles.js";

export function getSkiBotUserRole(role: string): SkiUserRole {
  if (role === "admin") return SkiUserRole.GROUP_ADMIN;
  if (role === "owner") return SkiUserRole.GROUP_OWNER;
  return SkiUserRole.USER;
}
