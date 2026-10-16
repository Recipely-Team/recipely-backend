-- A Pinterest pin that holds the recipe itself (a video or idea pin with no
-- outside link) is imported from the pin and named as Pinterest. A pin that
-- links to a blog stays WEB: the recipe is the blog's.
ALTER TYPE "SourcePlatform" ADD VALUE 'PINTEREST';
