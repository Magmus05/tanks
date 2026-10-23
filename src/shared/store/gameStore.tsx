import { create } from "zustand";

type GameStatus = "menu" | "singlePlayer" | "finished" | "multiPlayer";

interface GameState {
  gameStatus: GameStatus;
  isAssetsLoaded: boolean;
  // Параметры для HUD
  hp: number;
  bulletsCount: number;
  score: number;
  countsHit: number;
  countBots: number;

  setGameStatus: (status: GameStatus) => void;
  setAssetsLoaded: (loaded: boolean) => void;
  // Методы для изменения параметров из Phaser
  setHp: (hp: number) => void;
  setBulletsCount: (count: number) => void;
  incrementScore: () => void;
  incrementСountsHit: () => void;
  setCountBots: (count: number) => void;
  resetGameStats: () => void; // Для сброса при перезапуске сцены
}

export const useGameStore = create<GameState>((set) => ({
  gameStatus: "menu",
  isAssetsLoaded: false,
  hp: 100,
  bulletsCount: 50,
  score: 0,
  countsHit: 0,
  countBots: 2,

  setGameStatus: (gameStatus) => set({ gameStatus }),
  setAssetsLoaded: (isAssetsLoaded) => set({ isAssetsLoaded }),
  setCountBots: (newCount) => set({ countBots: newCount }),
  setHp: (hp) => set({ hp }),
  setBulletsCount: (bulletsCount) => set({ bulletsCount }),
  incrementScore: () => set((state) => ({ score: state.score + 1 })),
  incrementСountsHit: () =>
    set((state) => ({ countsHit: state.countsHit + 1 })),
  resetGameStats: () => set({ hp: 100, bulletsCount: 50, score: 0 }),
}));

// Как это будет работать в будущем для Multiplayer:
// Когда вы начнете делать мультиплеер, вы просто добавите новое состояние в Zustand: status: "lobby".
// В App.tsx вы напишете:
// tsx
// {gameStatus === "lobby" && <LobbyComponent />}
// И в этом LobbyComponent (написанном на чистом React) вы сможете выводить список комнат, инпут для ввода ID комнаты, кнопку «Создать приватную комнату» и список подключенных друзей. И только когда комната заполнится и все нажмут «Готов», хост переведет стейт в "playing", React скроет интерфейсы, а Phaser мгновенно запустит бой!
