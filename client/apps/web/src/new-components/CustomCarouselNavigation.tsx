"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import React, { useState } from "react";

import { cn } from "@/lib/utils";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/components/ui/carousel";

// Custom Navigation Buttons Component
const CustomCarouselNavigation = () => {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } =
    useCarousel();

  return (
    <>
      <button
        className={cn(
          "absolute left-0 top-1/2 flex size-10 -translate-x-full -translate-y-1/2 cursor-pointer justify-end active:scale-95",
          !canScrollPrev && "opacity-0",
        )}
        disabled={!canScrollPrev}
        onClick={scrollPrev}
      >
        <ChevronLeft className="size-5" />
        <span className="sr-only">Previous slide</span>
      </button>

      <button
        className={cn(
          "absolute -right-0 top-1/2 flex size-10 -translate-y-1/2 translate-x-full cursor-pointer active:scale-95",
          !canScrollNext && "opacity-0",
        )}
        disabled={!canScrollNext}
        onClick={scrollNext}
      >
        <ChevronRight className="size-5" />
        <span className="sr-only">Next slide</span>
      </button>
    </>
  );
};

const Skiper75Carousel = () => {
  const [isOpen, setIsOpen] = useState(false);

  const carouselItems = [
    {
      src: "/images/oct25Coll/iphone17/1.png",
      label: "iPhone 17 Pro",
      current: true,
    },
    {
      src: "/images/oct25Coll/iphone17/2.png",
      label: "iPhone 17",
      new: true,
    },
    {
      src: "/images/oct25Coll/iphone17/3.png",
      label: "iPhone 17 Air",
      new: true,
    },
    { src: "/images/oct25Coll/iphone17/4.png", label: "iPhone 16 Pro" },
    { src: "/images/oct25Coll/iphone17/5.png", label: "iPhone 16" },
    { src: "/images/oct25Coll/iphone17/6.png", label: "iPhone 16 E" },
    { src: "/images/oct25Coll/iphone17/7.png", label: "Compare" },
    { src: "/images/oct25Coll/iphone17/8.png", label: "Accessories" },
    { src: "/images/oct25Coll/iphone17/9.png", label: "iOS" },
  ];

  return (
    <MotionConfig
      transition={{
        type: "spring",
        stiffness: isOpen ? 200 : 350,
        damping: isOpen ? 30 : 40,
      }}
    >
      <div className="bg-muted font-sf-pro-display text-foreground flex h-full w-full justify-center">
        <motion.nav
          initial={false}
          animate={{
            borderRadius: isOpen ? "28px" : "18px",
          }}
          layout
          style={{
            paddingBlock: "12px",
            height: isOpen ? "fit-content" : "55px",
            backdropFilter: "blur(20px)",
            boxShadow: "0 0 0 1px var(--muted)",
          }}
          className="bg-background m-2 w-full max-w-[1024px] overflow-hidden"
        >
          {/* top header */}
          <div className="flex w-full items-center justify-between px-4">
            <div>
              {!isOpen && (
                <motion.h2
                  layout
                  layoutId="title-header"
                  className="flex text-xl font-[500] leading-[1.2105263158] tracking-[0.012em]"
                >
                  iPhone 17 Pro
                </motion.h2>
              )}
            </div>
            <div className="flex h-8 gap-2">
              <motion.div layout className="flex gap-2">
                <motion.button
                  initial={false}
                  animate={{
                    width: !isOpen ? "72px" : "42px",
                    height: !isOpen ? "28px" : "42px",
                    borderRadius: !isOpen ? "28px" : "38px",
                    backgroundColor: isOpen
                      ? "var(--foreground)"
                      : "transparent",
                  }}
                  transition={{
                    width: { duration: 0.2 },
                  }}
                  className={cn(
                    "border-foreground/10 cursor-pointer border text-xs",
                    isOpen ? "border-foreground/80" : "text-foreground",
                  )}
                  onClick={() => setIsOpen((x) => !x)}
                >
                  {!isOpen ? (
                    <motion.span
                      initial={false}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(4px)" }}
                      transition={{ duration: 0.2 }}
                    >
                      Explore
                    </motion.span>
                  ) : (
                    <motion.span
                      initial={{ opacity: 0, filter: "blur(4px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      transition={{ duration: 0.3 }}
                      className="text-background flex rotate-45 items-center justify-center"
                    >
                      <Plus className="stoke-2 size-6" />
                    </motion.span>
                  )}
                </motion.button>
              </motion.div>

              {!isOpen && (
                <motion.button
                  layoutId="pre-Order"
                  className="h-6.5 border-foreground/10 relative inline-flex cursor-pointer items-center rounded-full border bg-[#0071e3] px-3 tracking-[0.035em] text-white"
                >
                  <motion.span layoutId="buyText" className="text-xs">
                    Buy
                  </motion.span>
                </motion.button>
              )}
            </div>
          </div>

          {isOpen && (
            <motion.div layout className="h-full px-8 pt-5 lg:px-14">
              <motion.div
                initial={{ opacity: 0, y: "-150%" }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: "-150%" }}
                className="border-foreground/10 mb-10 h-40 border-b"
              >
                <Carousel className="w-full [&_[data-slot='carousel-content']]:overflow-visible [&_[data-slot='carousel-content']]:overflow-x-clip">
                  <CarouselContent className="-ml-2 md:-ml-4">
                    {carouselItems.map((item, index) => (
                      <CarouselItem
                        key={index}
                        className="md:basis-1/7 basis-1/4 pl-2 md:pl-4"
                      >
                        <motion.div
                          initial={{ opacity: 0, y: "-150%" }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.4,
                            bounce: 0,
                            type: "spring",
                            delay: index * 0.03,
                          }}
                          className="flex flex-col items-center"
                        >
                          <img
                            src={item.src}
                            className="h-18 object-cover"
                            alt={item.label}
                          />
                          <p className="pt-[12px] text-[14px] font-medium">
                            {item.label}
                          </p>
                          {item.new && (
                            <p className="text-xs text-orange-500">New</p>
                          )}
                          {item.current && (
                            <p className="text-foreground/30 text-xs">
                              Currently Viewing{" "}
                            </p>
                          )}
                        </motion.div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CustomCarouselNavigation />
                </Carousel>
              </motion.div>

              <div className="flex w-full flex-col justify-between gap-3 lg:flex-row">
                <motion.h2
                  layoutId="title-header"
                  className="text-3xl font-semibold leading-[1.2105263158] lg:text-[40px]"
                >
                  iPhone 17 Pro
                </motion.h2>
                <motion.div className="flex w-full items-center justify-between gap-6 lg:w-fit">
                  <motion.div
                    initial={{ opacity: 0, y: "-250%" }}
                    animate={{ opacity: 1, y: "0" }}
                    exit={{ opacity: 0, y: "-150%" }}
                    className="text-sm lg:text-right"
                  >
                    <b> From ₹82900.00*</b>
                    <p>or ₹12983.00/mo. for 6 mo.‡ </p>
                  </motion.div>
                  <motion.button
                    layoutId="pre-Order"
                    className="relative inline-flex h-11 cursor-pointer items-center rounded-full bg-[#0071e3] px-4 tracking-[0.035em] text-white"
                  >
                    <motion.span layoutId="buyText" className="text-lg">
                      Buy
                    </motion.span>
                  </motion.button>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: "-150%" }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: "-150%" }}
                className="mt-6 p-2 lg:p-5"
              >
                <div className="text-foreground/40 flex items-center gap-2 lg:text-xl">
                  {" "}
                  Overview <ChevronDown className="size-4" />{" "}
                </div>
                <div className="mt-5 flex max-w-xl flex-wrap gap-2 lg:mt-6">
                  {[
                    "highlights",
                    "performance",
                    "design",
                    "shared features",
                    "cameras",
                    "accesorirs",
                  ].map((item, index) => (
                    <div
                      key={index}
                      className={cn(
                        "hover:text-background hover:bg-foreground first:text-background first:bg-foreground mr-4 cursor-pointer rounded-full px-5 py-2 text-center font-medium capitalize lg:text-lg",
                      )}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: "-150%" }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: "-150%" }}
                className="mt-2 space-y-4 p-2 lg:p-5"
              >
                <div className="flex cursor-pointer items-center gap-2 font-medium text-[#0071e3] hover:underline lg:text-[19px]">
                  {" "}
                  Tech specs <ChevronRight className="size-4" />{" "}
                </div>
                <div className="flex cursor-pointer items-center gap-2 font-medium text-[#0071e3] hover:underline lg:text-[19px]">
                  {" "}
                  Switch from Android <ChevronRight className="size-4" />{" "}
                </div>
              </motion.div>
            </motion.div>
          )}
        </motion.nav>
      </div>
    </MotionConfig>
  );
};

export { Skiper75Carousel };
