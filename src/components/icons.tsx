import {
  ArrowDown,
  ArrowSquareOut,
  ArrowUp,
  ArrowsClockwise,
  Bell,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ChartBar,
  Check,
  CheckCircle,
  Circle,
  CircleHalf,
  CircleNotch,
  Clock,
  Compass,
  DiceFive,
  File,
  FilmSlate,
  Flag,
  FolderSimple,
  HandHeart,
  HardDrives,
  House,
  Info,
  List,
  ListChecks,
  MagnifyingGlass,
  Megaphone,
  Monitor,
  Moon,
  Play,
  Plus,
  Scissors,
  SignOut,
  Sparkle,
  SquaresFour,
  Star,
  Sun,
  TextAa,
  Television,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Tray,
  UserCircle,
  Users,
  Warning,
  Wrench,
  X,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type {
  Icon as PhosphorIcon,
  IconProps as PhosphorIconProps,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/**
 * Umbra's icon set: Phosphor, in one weight, behind one module.
 *
 * Everything imports from here rather than from the library, so the visual
 * voice is decided in a single place and swapping a glyph, a weight or even the
 * library itself never touches a screen.
 *
 * The SSR entry point is deliberate: these render on the server like any other
 * markup instead of dragging a client boundary into a page that has none.
 */
export type IconProps = PhosphorIconProps;

/** Light strokes to match the interface; bold only where a glyph must read at 16px. */
function icon(
  Glyph: PhosphorIcon,
  weight: PhosphorIconProps["weight"] = "light",
) {
  return function UmbraIcon({ className, ...props }: IconProps) {
    return (
      <Glyph
        weight={weight}
        className={cn("size-4 shrink-0", className)}
        {...props}
      />
    );
  };
}

export const SearchIcon = icon(MagnifyingGlass, "regular");
export const DiceIcon = icon(DiceFive);
export const CheckIcon = icon(Check, "bold");
export const CircleIcon = icon(Circle, "regular");
export const CircleHalfIcon = icon(CircleHalf, "fill");
export const ChevronRightIcon = icon(CaretRight, "bold");
export const ChevronDownIcon = icon(CaretDown, "bold");
export const ChevronUpIcon = icon(CaretUp, "bold");
export const ArrowDownIcon = icon(ArrowDown, "bold");
export const ArrowUpIcon = icon(ArrowUp, "bold");
export const CloseIcon = icon(X, "bold");
export const SignOutIcon = icon(SignOut, "regular");
export const PersonIcon = icon(UserCircle);
export const SunIcon = icon(Sun, "regular");
export const TextSizeIcon = icon(TextAa, "regular");
export const MoonIcon = icon(Moon, "regular");
export const DisplayIcon = icon(Monitor, "regular");
export const AnnounceIcon = icon(Megaphone);
export const DiskIcon = icon(HardDrives);
export const ExternalLinkIcon = icon(ArrowSquareOut, "regular");
export const AlertIcon = icon(Warning, "regular");
export const InfoIcon = icon(Info, "regular");
export const CheckCircleIcon = icon(CheckCircle, "regular");
export const ErrorCircleIcon = icon(XCircle, "regular");
export const ChevronLeftIcon = icon(CaretLeft, "bold");
export const BellIcon = icon(Bell);
export const FlagIcon = icon(Flag);
export const CompassIcon = icon(Compass);
export const HouseIcon = icon(House);
export const FollowUpIcon = icon(ListChecks);
export const SparkleIcon = icon(Sparkle);
export const MovieIcon = icon(FilmSlate);
export const SeriesIcon = icon(Television);
export const PollIcon = icon(ChartBar);
export const DashboardIcon = icon(SquaresFour);
export const RequestIcon = icon(Tray);
export const AccountsIcon = icon(Users);
export const SyncIcon = icon(ArrowsClockwise, "regular");
export const MenuIcon = icon(List, "regular");
export const PlusIcon = icon(Plus, "bold");
export const TrashIcon = icon(Trash, "regular");
export const FolderIcon = icon(FolderSimple, "regular");
export const FileIcon = icon(File, "regular");
export const PlayIcon = icon(Play, "fill");
export const CutIcon = icon(Scissors);
export const ClockIcon = icon(Clock, "regular");
export const WrenchIcon = icon(Wrench);
export const HandHeartIcon = icon(HandHeart);
export const ThumbsUpIcon = icon(ThumbsUp, "regular");
export const ThumbsDownIcon = icon(ThumbsDown, "regular");
/** Filled, so a score reads as a mark rather than as an empty rating to give. */
export const StarIcon = icon(Star, "fill");

/** Waiting. The only icon that carries motion. */
export function SpinnerIcon({ className, ...props }: IconProps) {
  return (
    <CircleNotch
      weight="bold"
      className={cn("size-4 shrink-0 animate-spin", className)}
      {...props}
    />
  );
}
