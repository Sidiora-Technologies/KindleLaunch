"use client";

import { useQuery } from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Check, ChevronDown, Search } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/dialog";

type Country = {
  name: string;
  code: string;
  flag: string;
};

// API function
const fetchCountries = async (): Promise<Country[]> => {
  const response = await fetch(
    "https://restcountries.com/v3.1/all?fields=name,cca2,flags",
  );

  if (!response.ok) {
    throw new Error("Failed to fetch countries");
  }

  const data = await response.json();

  return data
    .map((country: any) => ({
      name: country.name.common,
      code: country.cca2,
      flag: country.flags.svg,
    }))
    .sort((a: Country, b: Country) => a.name.localeCompare(b.name));
};

const CountrySelectDialog = ({
  isOpen,
  onClose,
  onSelectCountry,
  selectedCountry,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectCountry: (country: Country) => void;
  selectedCountry: Country | null;
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const hasSetInitialCountry = useRef(false);

  const {
    data: countries = [],
    isLoading,
    error,
    isError,
  } = useQuery({
    queryKey: ["countries"],
    queryFn: fetchCountries,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  // Get user's region from browser locale
  const getUserRegion = () => {
    try {
      const locale = navigator.language || navigator.languages?.[0] || "en-US";
      const region = locale.split("-")[1] || locale.split("_")[1];
      return region?.toUpperCase();
    } catch {
      return null;
    }
  };

  // Set initial country based on user's region (only once)
  useEffect(() => {
    if (!hasSetInitialCountry.current && countries.length > 0) {
      const userRegion = getUserRegion();
      if (userRegion) {
        // Find the country that matches the user's region
        const userCountry = countries.find(
          (country: Country) => country.code === userRegion,
        );
        if (userCountry) {
          onSelectCountry(userCountry);
        }
      }
      hasSetInitialCountry.current = true;
    }
  }, [countries, onSelectCountry]);

  // Filter countries based on search query (client-side filtering)
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) {
      return countries;
    }

    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        country.code.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [countries, searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleCountrySelect = (country: Country) => {
    onSelectCountry(country);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex h-full max-h-[700px] w-[450px] max-w-none flex-col rounded-3xl border-[#303030] bg-[#131313] p-0 text-white shadow-2xl">
        <DialogHeader className="p-5 pb-0">
          <DialogTitle className="text-base font-medium tracking-tight">
            Select your region
          </DialogTitle>

          {/* search */}
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#3A3A3A] bg-[#1F1F1F] px-3 py-2">
            <Search className="size-5 stroke-[1.5] text-[#737373]" />
            <input
              type="text"
              placeholder="Search by country or region"
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full bg-transparent tracking-tight outline-none"
            />
          </div>
        </DialogHeader>

        {/* list */}
        <div className="h-full overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-[#737373]">Loading countries...</div>
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-red-400">
                {error instanceof Error
                  ? error.message
                  : "Failed to load countries"}
              </div>
            </div>
          ) : filteredCountries.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-[#737373]">
                {searchQuery ? "No countries found" : "No countries available"}
              </div>
            </div>
          ) : (
            <ul className="w-full">
              {filteredCountries.map((country, index) => (
                <li
                  key={`${country.code}-${index}`}
                  className="relative flex h-[56px] cursor-pointer items-center gap-3 px-5 transition-colors duration-150 hover:bg-[#252525]"
                  onClick={() => handleCountrySelect(country)}
                >
                  <div className="size-8 overflow-hidden rounded-full">
                    <img
                      src={country.flag}
                      alt={`${country.name} flag`}
                      className="size-full object-cover"
                      onError={(e) => {
                        // Fallback to a placeholder if flag fails to load
                        const target = e.target as HTMLImageElement;
                        target.src =
                          "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjMzA2NjY2Ii8+CjxwYXRoIGQ9Ik0xNiAxNkMxNiAxNiAxNiAxNiAxNiAxNloiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+";
                      }}
                    />
                  </div>
                  <div className="flex flex-col">
                    <p className="font-medium tracking-tight">{country.name}</p>
                  </div>

                  {selectedCountry?.code === country.code && (
                    <Check className="absolute right-5 size-5" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const queryClient = new QueryClient();

const Skiper20 = () => {
  const [isLayoutOpen, setIsLayoutOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);

  const toggleLayout = () => {
    setIsLayoutOpen(!isLayoutOpen);
  };

  const handleSelectCountry = (country: Country) => {
    setSelectedCountry(country);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-full w-screen items-center justify-center bg-[#131313] text-white">
        <button
          onClick={toggleLayout}
          className="flex items-center justify-center gap-1 rounded-full bg-[#2F2F2F] p-1.5 transition-colors duration-200 hover:bg-[#3A3A3A]"
        >
          {selectedCountry ? (
            <>
              <div className="size-6 overflow-hidden rounded-full">
                <img
                  src={selectedCountry.flag}
                  alt={selectedCountry.name}
                  className="size-full object-cover"
                />
              </div>
            </>
          ) : (
            <>
              <div className="size-6 overflow-hidden rounded-full">
                <img
                  src="https://flagcdn.com/us.svg"
                  alt=""
                  className="size-full object-cover"
                />
              </div>
            </>
          )}
          <ChevronDown className="size-5" />
        </button>

        <CountrySelectDialog
          isOpen={isLayoutOpen}
          onClose={() => setIsLayoutOpen(false)}
          onSelectCountry={handleSelectCountry}
          selectedCountry={selectedCountry}
        />
      </div>
    </QueryClientProvider>
  );
};

export { CountrySelectDialog, Skiper20 };
export type { Country };

/**
 * Skiper 20 CountrySelectDialog — React + framer motion + Shadcn UI
 * Inspired by and adapted from https://app.uniswap.org/buy
 * We respect the original creators. This is an inspired rebuild with our own taste and does not claim any ownership.
 * These animations aren’t associated with the uniswap.org . They’re independent recreations meant to study interaction design
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Feedback and contributions are welcome.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.in
 * Twitter: https://x.com/Gur__vi
 */
