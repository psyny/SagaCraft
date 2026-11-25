New Brushes:

Terrain, category: pavement. With ground styles for cityscane or civilization floors. Like cobblestone, tiles, etc.
Terrain, ground: desert. So we have sand, but desert has dunes.
Terrain, ground: lava. Its a cracked ground but with lava in the cracks.
Terrain, water: lava. and water category should be renamed to (liquids) 
Route, Rivers: lava, not just a color but different style too.
Scenery, settlement: camp. with bonfires that glows at night.

Terrain, pavement, bricks: this is actually and edit. Its too dense for a worldmap texture. Remove it or make it larger sized.

--------------------

New Brush Types:
Enviromental Effects:
It sit above routes and terrain. It has a deoh integration with scenery and features.
Its visual effects, has internal tile integration (not with tiles with different types), much like the ones in the scenery.
Examples:  fireflyes that glow at night, moving mist on the ground level, and other cool env effects

Boundary features:
Something you did inspired me. With some settelemtn brushes, they have a wall around it. The wall even interact with roads and get oppened. This is awesome!
But instead of part of scenery brush, it should be a separated brush type.
As with Route, it will work between types. But instead of routes that are on the cener of the tile, this is drawn in the edge of the tile.
The first obvious is the Wall category, so we can have fences, stone wall, castle wall, brick walls, short cliff, medium cliff, high cliff.
It would be nice if liquid type routes when interacting with walls would form a fall (like water fall), and road would make an opening in the walls
I cant think of other categories at the moment, but add them if you can.
The current wall effects are flat top down, this we want to have some perspective, depth, so vertical wall (relative to screen) are thin representation, diagonal and jhorizontal have some height, meaning: they follow the same perspective as the mountains, trees, buildings.
They have the 3d depth like trees, buildings, etc too. So they appear integrated.

--------------------

UI Reorg:
Map tools meny: First group stay as is. Second group only has "images", images will be moved to brushes group as the last one.
Second group will be the weather + time group, because they also appear on stage and makes sense comming first.
On brushes group, as we said, images will be there as last tool. The new Enviromental Effects will be between Scenery and Features. And the Bounday Features will be after Routes.

--------------------------
Visuals:

Map Weather Effects:
Has to change...
They look very cheap... most of them are just circles... embers should look like ash, its not just a round shape.
Same with snow. We need better looking there.
Also, they look like they are falling vertically on the screen, meaning paralel to the actual map.
Sinc the map has some degree of perspective (for trees and such), the effects should look it falling ON THE MAP, not across the screen. This also means we should add some ground collision effect. 

Water ripples:
Its better than it was before, but it should loo more like an ocean waves shader, moving in the same direction as if the wind is moving it. Do your best here.
The lake brush should be different ripple style, more like calmer ripples, not affected by wind.

Mountains and hills and buildings:
Small detail, but these wide bodies should not have the bottom outline, so they would look better integrated with the location they are on. In fact, for organic like mountains and hills a small gradiant to transparent in the bottom would make them even more integrated, especially if the gradiante has some noise. Even on trees this might make some sense.


Better night visuals:
I dont know how you are dealing with the night glow of emmiting areas. But if its a layer, it easier to do what I want: at night, these glowing areas should have a glow/bloom effect. To look like the are actually emitting. some light. Its not that heavy, its more subtle and over a larger area. 

--------------------------

Config:
Animated map or not should be a User config, not a location settings. So users with lower end devices can save some performance.