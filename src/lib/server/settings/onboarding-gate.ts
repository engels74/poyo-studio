import type { OnboardingStateDto } from '../../features/settings/contracts';
import type { PlatformServices } from '../platform/runtime';
import { computeOnboardingState, readOnboarding } from './studio-settings';

export async function loadOnboardingState(platform: PlatformServices): Promise<OnboardingStateDto> {
  return computeOnboardingState(readOnboarding(platform.settings));
}
