/**
 * The Home loader (ADR-0104): a black screen with the TAHA mark turning on like an old TV, up only
 * while `<html>` has `is-loading` (`lib/home-loader`), which the root layout's script sets before the
 * first paint on a device that will get the Edit Room. Decoration: hidden from screen readers, never
 * clickable, and the page stays in the tree under it. It fades out once the class goes.
 */
export function HomeLoader() {
  return (
    <div aria-hidden="true" className="home-loader">
      <span className="home-loader-mark font-sans text-lg font-bold tracking-tight">TAHA</span>
    </div>
  )
}
