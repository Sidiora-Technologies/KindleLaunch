"use client";

import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { ArrowRight, ChevronLeft, Fingerprint, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  BsApple,
  BsDiscord,
  BsGithub,
  BsGoogle,
  BsTwitterX,
  BsWallet2,
} from "react-icons/bs";
import useMeasure from "react-use-measure";
import { Drawer } from "vaul";

import { cn } from "@/lib/utils";

import {
  CoinBase,
  MetaMask,
  PhantomWallet,
  TrustWallet,
} from "@/assets/LibIcons";

import { InputOTP, InputOTPSlot } from "../ui/input-otp";

const socialProviders = [
  { icon: BsGoogle, label: "Sign in with Google" },
  { icon: BsDiscord, label: "Sign in with Discord" },
  { icon: BsGithub, label: "Sign in with GitHub" },
  { icon: BsApple, label: "Sign in with Apple" },
  { icon: BsTwitterX, label: "Sign in with Farcaster" },
];

const authMethods = ["Email", "Phone", "Passkey"];

export const Skiper21 = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState("signin");
  const [elementRef, bounds] = useMeasure();

  const content = useMemo(() => {
    switch (view) {
      case "signin":
        return <SignInView setView={setView} />;
      case "email-otp":
        return <EmailOTPView setView={setView} />;
      case "phone-otp":
        return <PhoneOTPView setView={setView} />;
      case "passkey":
        return <PasskeyView setView={setView} />;
      case "wallet":
        return <WalletView setView={setView} />;
    }
  }, [view]);

  return (
    <div className="font-open-runde h-full w-full">
      <div className="bg-muted flex h-full w-full flex-col items-center justify-center">
        <div className="mb-40 grid content-start justify-items-center gap-6 text-center">
          <span className="after:to-foreground relative max-w-[12ch] text-xs uppercase leading-tight opacity-40 after:absolute after:left-1/2 after:top-full after:h-16 after:w-px after:bg-gradient-to-b after:from-transparent after:content-['']">
            Click to open sign in
          </span>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-muted4 rounded-full px-4 py-2"
        >
          Sign In
        </button>
      </div>

      <Drawer.Root open={isOpen} onOpenChange={setIsOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            className="bg-background dark:bg-background/80 fixed inset-0 z-20 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <Drawer.Content
            className="bg-background z-21 fixed inset-x-4 bottom-4 mx-auto max-w-[361px] overflow-hidden rounded-[36px] outline-none md:mx-auto md:w-full"
            style={{ fontFamily: "Open Runde" }}
          >
            <Drawer.Title className="hidden">Skiper ui </Drawer.Title>
            <motion.div
              animate={{
                height: bounds.height,
                transition: {
                  duration: 0.27,
                  ease: [0.25, 1, 0.5, 1],
                },
              }}
            >
              <Drawer.Close asChild>
                <button className="bg-muted4 text-foreground absolute right-6 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-transform focus:scale-95 active:scale-75">
                  <Plus className="rotate-45 opacity-45" />
                </button>
              </Drawer.Close>
              <div ref={elementRef} className="bg-muted">
                <AnimatePresence initial={false} mode="popLayout" custom={view}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    key={view}
                    transition={{
                      duration: 0.27,
                      ease: [0.26, 0.08, 0.25, 1],
                    }}
                  >
                    {content}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
};

// Sign In View (Original Skiper67 UI)
function SignInView({ setView }: { setView: (view: string) => void }) {
  const [input, setInput] = useState<string>("");
  const [selectedMethod, setSelectedMethod] = useState<string>("Email");

  const getInputConfig = (method: string) => {
    switch (method) {
      case "Email":
        return {
          type: "email",
          placeholder: "yo@gxuri.in",
          pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        };
      case "Phone":
        return {
          type: "tel",
          placeholder: "+1 (555) 123-4567",
          pattern: "^[+]?[0-9\\s\\-\\(\\)]{10,}$",
        };
      case "Passkey":
        return {
          type: "text",
          placeholder: "Login with passkey",
          pattern: "^[a-zA-Z0-9]{6,}$",
        };
      default:
        return {
          type: "email",
          placeholder: "email@acme.com",
          pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        };
    }
  };

  const handleSubmit = () => {
    if (selectedMethod === "Passkey") {
      setView("passkey");
      return;
    }

    const config = getInputConfig(selectedMethod);
    const regex = new RegExp(config.pattern);

    if (!input.trim()) {
      alert("Please enter a value");
      return;
    }

    if (!regex.test(input)) {
      alert(`Please enter a valid ${selectedMethod.toLowerCase()}`);
      return;
    }

    // Navigate to appropriate view based on method
    if (selectedMethod === "Email") {
      setView("email-otp");
    } else if (selectedMethod === "Phone") {
      setView("phone-otp");
    } else if (selectedMethod === "Passkey") {
      setView("passkey");
    }
  };

  const isInputValid = () => {
    if (selectedMethod === "Passkey") {
      return true;
    }

    const config = getInputConfig(selectedMethod);
    const regex = new RegExp(config.pattern);
    return input.trim() && regex.test(input);
  };

  const inputConfig = getInputConfig(selectedMethod);

  return (
    <div>
      <div className="flex flex-col space-y-1.5 text-center sm:text-left">
        <h2 className="flex items-center justify-between px-6 py-6 text-center text-xl font-semibold tracking-tight sm:font-medium">
          <span className="select-none">Sign In</span>
        </h2>
      </div>
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-2 px-6">
          <div className="flex w-full items-center justify-center gap-2">
            {socialProviders.map((provider) => (
              <button
                key={provider.label}
                aria-label={provider.label}
                className="bg-muted2 dark:hover:bg-muted3 group flex h-12 w-full items-center justify-center rounded-xl transition-all duration-200 ease-out active:scale-95"
              >
                <provider.icon />
              </button>
            ))}
          </div>
          <div className="bg-muted2 flex h-12 w-full items-center rounded-2xl px-1">
            <div className="relative mx-auto flex w-full items-center">
              <ul className="mx-auto flex w-full flex-row justify-center gap-2">
                {authMethods.map((method) => (
                  <button
                    key={method}
                    aria-label={`Select ${method}`}
                    className={`relative flex h-10 w-full cursor-pointer items-center justify-center px-3 py-1.5 text-center text-base font-semibold transition-colors duration-200 ease-out sm:font-medium ${
                      selectedMethod === method
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => setSelectedMethod(method)}
                  >
                    {selectedMethod === method && (
                      <motion.div
                        layoutId="selected-method"
                        className="bg-foreground/5 absolute inset-0 rounded-xl"
                      />
                    )}
                    <span className="relative select-none text-inherit">
                      {method}
                    </span>
                  </button>
                ))}
              </ul>
            </div>
          </div>
          <div className="bg-muted2 flex h-12 w-full items-center justify-start gap-3 overflow-hidden rounded-2xl pl-4 pr-1 text-base">
            <div className="flex w-full items-center justify-start">
              {selectedMethod === "Passkey" ? (
                <div className="flex items-center gap-3">
                  <Fingerprint className="text-muted-foreground h-6 w-6" />
                  <span className="sm:font-regular w-full text-base font-medium tracking-tight opacity-50">
                    {inputConfig.placeholder}
                  </span>
                </div>
              ) : (
                <input
                  placeholder={inputConfig.placeholder}
                  autoFocus
                  className="focus-visible:outline-hidden sm:font-regular w-full text-base font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  type={inputConfig.type}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSubmit();
                    }
                  }}
                />
              )}
            </div>
            <button
              aria-label="Continue"
              type="submit"
              className={`shadow-xs group flex h-10 w-12 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ease-out ${
                isInputValid()
                  ? "cursor-pointer bg-[#4EAFFF] text-white hover:bg-[#4EAFFF]/90 active:scale-95"
                  : "bg-muted3 text-muted-foreground cursor-not-allowed"
              }`}
              onClick={handleSubmit}
              disabled={!isInputValid()}
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div className="relative">
            <div className="absolute inset-0 flex h-10 items-center">
              <span className="w-full rounded-full border-t opacity-20" />
            </div>
            <div className="relative flex h-10 justify-center text-xs uppercase">
              <span className="bg-muted text-muted-foreground flex items-center justify-center px-2 font-medium">
                Or
              </span>
            </div>
          </div>
          <button
            onClick={() => setView("wallet")}
            className="flex h-12 w-full cursor-pointer select-none items-center justify-center gap-2 rounded-full bg-[#4EAFFF] text-base font-semibold text-white transition-all duration-200 ease-out hover:bg-[#4EAFFF]/80 focus:scale-95 active:scale-95 sm:font-medium"
          >
            <BsWallet2 className="h-5 w-5" />
            Connect Wallet
          </button>
        </div>
      </div>
    </div>
  );
}

// Email OTP View
function EmailOTPView({ setView }: { setView: (view: string) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-6 py-6 text-center text-xl font-semibold tracking-tight sm:font-medium">
        <button
          onClick={() => setView("signin")}
          className="bg-muted4 text-foreground flex h-8 w-8 items-center justify-center rounded-full transition-transform focus:scale-95 active:scale-75"
        >
          <ChevronLeft className="opacity-45" />
        </button>
        <h2 className="select-none">Confirm Email</h2>
        <span className="bg-muted4 text-foreground size-8 opacity-0" />
      </div>

      <div className="space-y-6 px-6 text-center">
        <div>
          <p className="text-muted-foreground">
            Enter the verification code sent to
          </p>
          <h1 className="font-medium tracking-tight">yo@guri.in</h1>
        </div>

        <div className="space-y-4">
          <InputOTP
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setView("signin");
              }
            }}
            maxLength={6}
            className="flex justify-between gap-3"
          >
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={0}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={1}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={2}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={3}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={4}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={5}
            />
          </InputOTP>

          <button
            onClick={() => setView("signin")}
            className="mb-6 w-full rounded-full bg-green-500 py-3 font-semibold text-white transition-colors"
          >
            Verify Code
          </button>
        </div>
      </div>
    </div>
  );
}

// Phone OTP View
function PhoneOTPView({ setView }: { setView: (view: string) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-6 py-6 text-center text-xl font-semibold tracking-tight sm:font-medium">
        <button
          onClick={() => setView("signin")}
          className="bg-muted4 text-foreground flex h-8 w-8 items-center justify-center rounded-full transition-transform focus:scale-95 active:scale-75"
        >
          <ChevronLeft className="opacity-45" />
        </button>
        <h2 className="select-none">Confirm Phone</h2>
        <span className="bg-muted4 text-foreground size-8 opacity-0" />
      </div>

      <div className="space-y-6 px-6 text-center">
        <div>
          <p className="text-muted-foreground">
            Enter the verification code sent to
          </p>
          <h1 className="font-medium tracking-tight">+1 (555) 123-4567</h1>
        </div>

        <div className="space-y-4">
          <InputOTP
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setView("signin");
              }
            }}
            maxLength={6}
            className="flex justify-between gap-3"
          >
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={0}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={1}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={2}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={3}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={4}
            />
            <InputOTPSlot
              className="!bg-muted4 data-[active=true]:ring-foreground/20 h-11 w-full !rounded-xl border-none"
              index={5}
            />
          </InputOTP>

          <button
            onClick={() => setView("signin")}
            className="mb-6 w-full rounded-full bg-green-500 py-3 font-semibold text-white transition-colors"
          >
            Verify Code
          </button>
        </div>
      </div>
    </div>
  );
}

// Passkey View
function PasskeyView({ setView }: { setView: (view: string) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-6 py-6 text-center text-xl font-semibold tracking-tight sm:font-medium">
        <button
          onClick={() => setView("signin")}
          className="bg-muted4 text-foreground flex h-8 w-8 items-center justify-center rounded-full transition-transform focus:scale-95 active:scale-75"
        >
          <ChevronLeft className="opacity-45" />
        </button>
        <h2 className="select-none">Passkey</h2>
        <span className="bg-muted4 text-foreground size-8 opacity-0" />
      </div>

      <div className="flex flex-col items-center justify-center space-y-6 px-6 text-center">
        <Button
          duration={1500}
          borderRadius="30px"
          containerClassName="p-[6px] "
          className="border-muted4 outline-3 text-foreground outline-muted bg-muted2 border-3 flex size-20 items-center justify-center !rounded-[24px]"
        >
          <Fingerprint className="size-8 opacity-45" />
        </Button>
        <div>
          <h1 className="text-xl font-medium tracking-tight">
            Waiting for passkey
          </h1>
          <p className="text-muted-foreground max-w-2xs mt-1 text-pretty text-sm">
            Please follow prompts to verify your passkey.
          </p>
        </div>

        <button
          onClick={() => setView("signin")}
          className="mb-6 w-full rounded-full bg-[#4EAFFF] py-3 font-semibold text-white transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// Wallet View
function WalletView({ setView }: { setView: (view: string) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-6 py-6 text-center text-xl font-semibold tracking-tight sm:font-medium">
        <button
          onClick={() => setView("signin")}
          className="bg-muted4 text-foreground flex h-8 w-8 items-center justify-center rounded-full transition-transform focus:scale-95 active:scale-75"
        >
          <ChevronLeft className="opacity-45" />
        </button>
        <h2 className="select-none">Connect Wallet</h2>
        <span className="bg-muted4 text-foreground size-8 opacity-0" />
      </div>

      <div className="space-y-2 px-6 pb-6 text-center">
        <div
          onClick={() => setView("signin")}
          className="bg-muted2 hover:bg-muted4 h-15 flex cursor-pointer items-center justify-between rounded-2xl px-4"
        >
          <h1 className="text-lg font-medium tracking-tight">Metamask</h1>
          <MetaMask className="size-6" />
        </div>
        <div
          onClick={() => setView("signin")}
          className="bg-muted2 hover:bg-muted4 h-15 flex cursor-pointer items-center justify-between rounded-2xl px-4"
        >
          <h1 className="text-lg font-medium tracking-tight">Coinbase</h1>
          <CoinBase className="size-6" />
        </div>
        <div
          onClick={() => setView("signin")}
          className="bg-muted2 hover:bg-muted4 h-15 flex cursor-pointer items-center justify-between rounded-2xl px-4"
        >
          <h1 className="text-lg font-medium tracking-tight">Phantom</h1>
          <PhantomWallet />
        </div>
        <div
          onClick={() => setView("signin")}
          className="bg-muted2 hover:bg-muted4 h-15 flex cursor-pointer items-center justify-between rounded-2xl px-4"
        >
          <h1 className="text-lg font-medium tracking-tight">Trust Wallet</h1>
          <TrustWallet />
        </div>
        <div
          onClick={() => setView("signin")}
          className="bg-muted2 hover:bg-muted4 h-15 flex cursor-pointer items-center justify-between rounded-2xl px-4"
        >
          <div className="flex items-center justify-start gap-3">
            <span className="text-center text-lg font-medium">
              Other Wallets
            </span>
            <div className="border-foreground/10 text-foreground/50 bg-muted flex select-none items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold sm:font-medium">
              350+
            </div>
          </div>
          <div className="border-foreground/10 text-foreground/50 bg-muted flex size-9 select-none items-center justify-center rounded-lg border text-xs font-semibold sm:font-medium">
            <BsWallet2 className="size-5 opacity-45" />
          </div>
        </div>
        <button
          onClick={() => setView("signin")}
          className="hover:text-foreground text-muted-foreground flex w-full items-center justify-center gap-2 pb-3 pt-6 font-semibold sm:font-medium"
        >
          <BsWallet2 className="size-5" />I Don't Have a Wallet
        </button>
      </div>
    </div>
  );
}

export function Button({
  borderRadius = "1.75rem",
  children,
  as: Component = "button",
  containerClassName,
  borderClassName,
  duration,
  className,
  ...otherProps
}: {
  borderRadius?: string;
  children: React.ReactNode;
  as?: any;
  containerClassName?: string;
  borderClassName?: string;
  duration?: number;
  className?: string;
  [key: string]: any;
}) {
  return (
    <Component
      className={cn(
        "relative overflow-hidden bg-transparent p-[1px] text-xl",
        containerClassName,
      )}
      style={{
        borderRadius: borderRadius,
      }}
      {...otherProps}
    >
      <div
        className="absolute inset-0"
        style={{ borderRadius: `calc(${borderRadius} * 0.96)` }}
      >
        <MovingBorder duration={duration} rx="30%" ry="30%">
          <div
            className={cn(
              "h-20 w-20 bg-[radial-gradient(#0ea5e9_40%,transparent_60%)] opacity-[0.8]",
              borderClassName,
            )}
          />
        </MovingBorder>
      </div>

      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center border border-slate-800 bg-slate-900/[0.8] text-sm text-white antialiased backdrop-blur-xl",
          className,
        )}
        style={{
          borderRadius: `calc(${borderRadius} * 0.96)`,
        }}
      >
        {children}
      </div>
    </Component>
  );
}

export const MovingBorder = ({
  children,
  duration = 3000,
  rx,
  ry,
  ...otherProps
}: {
  children: React.ReactNode;
  duration?: number;
  rx?: string;
  ry?: string;
  [key: string]: any;
}) => {
  const pathRef = useRef<any>(null);
  const progress = useMotionValue<number>(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMillisecond = length / duration;
      progress.set((time * pxPerMillisecond) % length);
    }
  });

  const x = useTransform(
    progress,
    (val) => pathRef.current?.getPointAtLength(val).x,
  );
  const y = useTransform(
    progress,
    (val) => pathRef.current?.getPointAtLength(val).y,
  );

  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
        {...otherProps}
      >
        <rect
          fill="none"
          width="100%"
          height="100%"
          rx={rx}
          ry={ry}
          ref={pathRef}
        />
      </svg>
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "inline-block",
          transform,
        }}
      >
        {children}
      </motion.div>
    </>
  );
};
