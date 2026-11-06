/**
 * Payload always renders a "forgot password?" link under the login form, and cms has no email
 * transport (ADR-0013), so this hides it. Passwords are reset with `pnpm user:reset-password`.
 * Registered as `admin.components.afterLogin`; the API side is refused in `collections/Users.ts`.
 */
export function HideForgotPassword() {
  return <style>{'a[href$="/forgot"] { display: none !important; }'}</style>
}
