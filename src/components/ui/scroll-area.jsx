
import * as React from "react"

const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={`overflow-auto ${className}`}
    {...props}
  >
    {children}
  </div>
))
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef(({ className, orientation = "vertical", ...props }, ref) => (
  <div ref={ref} {...props} />
))
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
