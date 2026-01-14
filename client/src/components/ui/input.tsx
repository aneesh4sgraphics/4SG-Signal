import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] placeholder:text-[#999999] focus:outline-none focus:border-[#CFCFCF] focus:ring-1 focus:ring-[rgba(0,0,0,0.05)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#333333] dark:bg-[#242424] dark:text-[#FAFAFA] dark:placeholder:text-[#666666] dark:focus:border-[#444444] dark:focus:ring-[rgba(255,255,255,0.05)]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
