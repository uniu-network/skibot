export const SkiUserRole = {
  USER: 0,
  GROUP_ADMIN: 1,
  GROUP_OWNER: 2,
  BOT_ADMIN: 3,
} as const;

export type SkiUserRole = (typeof SkiUserRole)[keyof typeof SkiUserRole];
