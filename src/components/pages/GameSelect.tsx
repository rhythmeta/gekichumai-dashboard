import type { Game } from "@/App";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export function GameSelect({
  game,
  onChange,
}: {
  game: Game;
  onChange: (game: Game) => void;
}) {
  return (
    <Select value={game} onValueChange={(value) => onChange(value as Game)}>
      <SelectTrigger aria-label="选择游戏" className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="maimaid">maimaid</SelectItem>
        <SelectItem value="chunithmd">chunithmd</SelectItem>
      </SelectContent>
    </Select>
  );
}
