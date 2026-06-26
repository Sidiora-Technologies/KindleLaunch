"use client";

import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { cn } from "@/lib/utils";

const InputOTP = React.forwardRef<
  React.ComponentRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn("flex items-center gap-2", containerClassName)}
    className={cn("disabled:cursor-not-allowed", className)}
    {...props}
  />
));
InputOTP.displayName = "InputOTP";

const InputOTPSlot = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { index: number }
>(({ index, className, ...props }, ref) => {
  const inputOTPContext = React.useContext(OTPInputContext);
  const slot = inputOTPContext.slots[index];
  const { char, hasFakeCaret, isActive } = slot ?? { char: null, hasFakeCaret: false, isActive: false };

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center border-y border-r border-[#303030] text-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md",
        isActive && "z-10 ring-2 ring-offset-0 ring-white/20",
        className,
      )}
      data-active={isActive}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink h-4 w-px bg-white duration-1000" />
        </div>
      )}
    </div>
  );
});
InputOTPSlot.displayName = "InputOTPSlot";

export { InputOTP, InputOTPSlot };
