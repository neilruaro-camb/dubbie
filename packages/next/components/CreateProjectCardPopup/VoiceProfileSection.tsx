import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpCircle } from "lucide-react";
import { ALL_VOICES, type Voice } from "@dubbie/shared/voices";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useEffect, useState } from "react";
import { AudioPlayerIcon } from "./AudioPlayerIcon";
import { API_ENDPOINT } from "@/lib/constants";

export function VoiceProfileSection({
  setSelectedVoiceName,
}: {
  setSelectedVoiceName: (value: string) => void;
}) {
  const [cambVoices, setCambVoices] = useState<Voice[]>([]);

  useEffect(() => {
    async function fetchCambVoices() {
      try {
        const res = await fetch(`${API_ENDPOINT}/camb-voices`);
        if (res.ok) {
          const voices = await res.json();
          setCambVoices(voices);
        }
      } catch {
        // CAMB voices unavailable, no problem
      }
    }
    fetchCambVoices();
  }, []);

  const allVoices = [...ALL_VOICES, ...cambVoices];

  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="flex items-center text-sm">
        <Tooltip>
          <span className="flex items-center opacity-50">Voice Profile</span>
          <TooltipTrigger asChild>
            <HelpCircle size={16} className="ml-1.5 opacity-50" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px]" side="right" align="end">
            If you don't specify a voice, Dubbie will automatically select the
            best one for your chosen language.
            <br />
            <br />
            Some voices are better suited for specific languages. For example,
            if you use one of the OpenAI voices for Chinese, it will likely have
            a foreign accent, and it may also default to a cantonese accent.
            <br />
            <br />
            CAMB AI voices are fetched from your account and support
            multilingual speech generation.
          </TooltipContent>
        </Tooltip>
      </div>
      <Select onValueChange={(value) => setSelectedVoiceName(value)}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select a voice" />
        </SelectTrigger>
        <SelectContent className="pr-2">
          {cambVoices.length > 0 && (
            <SelectGroup>
              <SelectLabel className="font-medium opacity-50">CAMB AI Voices</SelectLabel>
              {cambVoices.map((option) => (
                <div
                  key={`camb-${option.cambVoiceId}`}
                  className="flex flex-row items-center justify-start gap-2"
                >
                  <SelectItem
                    value={option.name}
                    className="flex w-full flex-row flex-nowrap items-center justify-between"
                  >
                    <div>{option.name}</div>
                    <div className="opacity-50">
                      {option.gender} - camb
                    </div>
                  </SelectItem>
                  {option.exampleSoundUrl && (
                    <AudioPlayerIcon exampleSoundUrl={option.exampleSoundUrl} />
                  )}
                </div>
              ))}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel className="font-medium opacity-50">Built-in Voices</SelectLabel>
            {ALL_VOICES.map((option) => (
              <div
                key={option.name}
                className="flex flex-row items-center justify-start gap-2"
              >
                <SelectItem
                  value={option.name}
                  className="flex w-full flex-row flex-nowrap items-center justify-between"
                >
                  <div>{option.name}</div>

                  <div className="opacity-50">
                    {option.language} - {option.gender} - {option.provider}
                  </div>
                </SelectItem>

                {option.exampleSoundUrl && (
                  <AudioPlayerIcon exampleSoundUrl={option.exampleSoundUrl} />
                )}
              </div>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
