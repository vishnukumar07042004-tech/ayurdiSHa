import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";

/**
 * The one button for the site. Renders a router <Link> (`to`), an <a>
 * (`href`) or a <button>, with the same pill styling in every case.
 *
 * variant: primary | secondary | tertiary | on-dark | on-dark-secondary
 * size:    sm (32px) | md (44px) | lg (54px)
 */
export function buttonClass({ variant = "primary", size = "md", block = false, className = "" } = {}) {
  return [
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    block ? "ui-btn--block" : "",
    className,
  ].filter(Boolean).join(" ");
}

const Button = React.forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    block = false,
    loading = false,
    icon = null,
    iconAfter = null,
    to,
    href,
    className = "",
    children,
    type = "button",
    disabled,
    ...rest
  },
  ref
) {
  const cls = buttonClass({ variant, size, block, className: `${className}${loading ? " is-loading" : ""}` });
  const content = (
    <>
      {loading ? <Loader2 size={16} className="ui-btn-spin" aria-hidden="true" /> : icon}
      <span className="ui-btn-label">{children}</span>
      {iconAfter}
    </>
  );
  if (to != null) {
    return <Link ref={ref} to={to} className={cls} {...rest}>{content}</Link>;
  }
  if (href != null) {
    return <a ref={ref} href={href} className={cls} {...rest}>{content}</a>;
  }
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
});

export default Button;

/** "Learn more ›" text link with the chevron nudge. */
export function MoreLink({ to, href, onClick, children, className = "", onDark = false, ...rest }) {
  const cls = `ui-link${onDark ? " ui-link--on-dark" : ""}${className ? ` ${className}` : ""}`;
  const inner = (
    <>
      <span>{children}</span>
      <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" className="ui-link-chev" />
    </>
  );
  if (to != null) return <Link to={to} onClick={onClick} className={cls} {...rest}>{inner}</Link>;
  if (href != null) return <a href={href} onClick={onClick} className={cls} {...rest}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls} {...rest}>{inner}</button>;
}
