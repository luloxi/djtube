export {};

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }

  namespace YT {
    enum PlayerState {
      UNSTARTED = -1,
      ENDED = 0,
      PLAYING = 1,
      PAUSED = 2,
      BUFFERING = 3,
      CUED = 5,
    }

    interface PlayerOptions {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: Player }) => void;
        onStateChange?: (event: { data: number; target: Player }) => void;
        onError?: (event: { data: number; target: Player }) => void;
      };
    }

    interface VideoData {
      video_id?: string;
      title?: string;
      author?: string;
    }

    interface Player {
      destroy(): void;
      playVideo(): void;
      pauseVideo(): void;
      cueVideoById(videoId: string | { videoId: string; startSeconds?: number }): void;
      loadVideoById(videoId: string | { videoId: string; startSeconds?: number }): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      setVolume(volume: number): void;
      getVolume(): number;
      mute(): void;
      unMute(): void;
      setPlaybackRate(suggestedRate: number): void;
      getPlaybackRate(): number;
      getAvailablePlaybackRates(): number[];
      getCurrentTime(): number;
      getDuration(): number;
      getPlayerState(): number;
      getVideoData(): VideoData;
      getPlaylist(): string[] | null;
      cuePlaylist(playlist: string | { list: string; listType?: string; index?: number }): void;
    }

    const Player: new (element: HTMLElement | string, options: PlayerOptions) => Player;
  }
}
