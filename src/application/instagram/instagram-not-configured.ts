import { ServiceUnavailableFailure } from '@core/failure';

/** The failure every Instagram feature answers on a server without INSTAGRAM_APP_ID / _SECRET. */
export const instagramNotConfigured = (): ServiceUnavailableFailure =>
  new ServiceUnavailableFailure('errors.instagram.not_configured');
