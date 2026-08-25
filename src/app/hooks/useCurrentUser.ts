import {
  readCurrentSemester,
  readCurrentUser,
  type CurrentSemester,
  type CurrentUser,
} from "../config/auth";

export type { CurrentSemester, CurrentUser };

export function useCurrentUser(): CurrentUser | null {
  return readCurrentUser();
}

export function useCurrentSemester(): CurrentSemester | null {
  return readCurrentSemester();
}

