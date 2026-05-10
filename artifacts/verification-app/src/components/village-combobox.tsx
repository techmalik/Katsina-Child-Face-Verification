import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { KATSINA_VILLAGES } from "@/data/katsina-villages";

interface VillageComboboxProps {
  value: string;
  lga: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function VillageCombobox({ value, lga, onChange, disabled }: VillageComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const villages = lga ? (KATSINA_VILLAGES[lga] ?? []) : [];

  const handleSelect = (selected: string) => {
    onChange(selected);
    setOpen(false);
    setInputValue("");
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      handleSelect(inputValue.trim());
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full h-14 text-lg justify-between font-normal",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">{value || (lga ? "Select or type village…" : "Select LGA first")}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type a village…"
            value={inputValue}
            onValueChange={setInputValue}
            onKeyDown={handleInputKeyDown}
          />
          <CommandList>
            <CommandEmpty>
              <button
                type="button"
                className="w-full px-4 py-3 text-sm text-left hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (inputValue.trim()) handleSelect(inputValue.trim());
                }}
              >
                {inputValue.trim()
                  ? `Use "${inputValue.trim()}"`
                  : "No villages found"}
              </button>
            </CommandEmpty>
            {villages.length > 0 && (
              <CommandGroup heading={`Villages in ${lga}`}>
                {villages.map((village) => (
                  <CommandItem
                    key={village}
                    value={village}
                    onSelect={handleSelect}
                    className="text-base py-3"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === village ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {village}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
