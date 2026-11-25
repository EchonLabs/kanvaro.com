import type { RoleSummary as RoleSummaryRow } from './api'

/** Capacity per role across the organisation: how much is committed and how much is free. */
export function RoleSummary({ roles }: { roles: RoleSummaryRow[] }) {
  if (roles.length === 0) return null

  return (
    <section className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-5">
      <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Allocation by Role</h2>
      <p className="mt-0.5 text-[13px] text-[var(--apple-secondary-label)]">Capacity distribution across your organization</p>
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
        {roles.map((role) => {
          const capacity = role.resources * 100
          const used = capacity > 0 ? Math.min(100, Math.round((role.allocated / capacity) * 100)) : 0
          return (
            <div key={role.roleLabel}>
              <p className="truncate text-[13px] font-semibold text-[var(--apple-label)]">{role.roleLabel}</p>
              <p className="text-[11px] text-[var(--apple-secondary-label)]">
                {role.resources} {role.resources === 1 ? 'resource' : 'resources'}
              </p>
              <span
                role="progressbar"
                aria-label={`${role.roleLabel} capacity used`}
                aria-valuenow={used}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]"
              >
                <span className="block h-full rounded-full bg-[var(--apple-system-blue)]" style={{ width: `${used}%` }} />
              </span>
              <p className="mt-2 text-[12px] font-semibold tabular-nums text-[var(--apple-label)]">{role.allocated}% allocated</p>
              <p className="text-[11px] tabular-nums text-[var(--apple-secondary-label)]">{role.available}% available</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
