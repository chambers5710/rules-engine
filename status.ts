import type { Status, StatusFlags } from "./types.js"

export const emptyStatus = (): StatusFlags => ({
  poison: false,
  burn: false,
  paralyzed: false,
  asleep: false,
  confused: false,
})

const ACP = ["asleep", "confused", "paralyzed"] as const

function isAcp(status: Status): status is (typeof ACP)[number] {
  return (ACP as readonly Status[]).includes(status)
}

// Apply one flag. ACP replace: the three attack-blockers are one at a time.
export function withStatus(flags: StatusFlags, status: Status): StatusFlags {
  const next: StatusFlags = { ...flags, [status]: true }
  if (!isAcp(status)) return next
  for (const flag of ACP) {
    if (flag !== status) next[flag] = false
  }
  return next
}
