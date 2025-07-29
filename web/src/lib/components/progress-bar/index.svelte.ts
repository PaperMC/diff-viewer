import type { RestProps } from "$lib/types";

export interface ProgressBarProps extends RestProps {
    state?: ProgressBarState | undefined;
}

export function useProgressBarState(state: ProgressBarState | undefined): ProgressBarState {
    return state === undefined ? new ProgressBarState(0, 100) : state;
}

export class ProgressBarState {
    value: number | null = $state(null);
    max: number = $state(100);

    constructor(value: number | null, max: number) {
        this.value = value;
        this.max = max;
    }

    setProgress(value: number, max: number) {
        this.value = value;
        this.max = max;
    }

    setSpinning() {
        this.value = null;
        this.max = 100;
    }

    isSpinning(): boolean {
        return this.value === null;
    }

    isDone(): boolean {
        return this.value !== null && this.value >= this.max;
    }

    getPercent(): number | undefined {
        if (this.value === null) {
            return undefined;
        }
        if (this.max <= 0) {
            return 0;
        }
        return (this.value / this.max) * 100;
    }
}
