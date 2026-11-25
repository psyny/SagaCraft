We will plan and add a map painter feature...

It will be for creating world maps, but in the future it will also  be to create battlegrounds.

It will live in the the map tools meny, but only displayed on map editor, not  stage set. And after labels, a div, then images (icon is picture frame, and yes, we will be moving  images funcionality here as we did with others), div, tile tools, path tools, object tools

On map details tab, it will have a "map painter style" dropdown, that will for now be "sketch" or "diorama". 
Map styles will define how the map is painted. So every brush type needs to have a representative on each map painter style. Like a tree shoudl hae a sketch stle and a diorama style.
And a map type "world map" or "local map". Local map is what we will not be doing yet. This define the assets used.
Also the "animated painted map" flag. Trees sway, water rippes, gress sawy in the wind.... This is a hard project on artistic side.

Pictures shoud now have ordering. And they are always  OVEr the painted map.

Painted map will paint grid tiles. And we will use tile transitions to make smooth artistic transitions between tiles.
For example, a tile A is sand, tile B is grass. Between tile A and B, on the boundary, we will have a texture of sand fading into grass. Can bea linear fade, when you lack creativity, or a more involved fade. The transition should happen within one tile, to make it easier (i think its easier, but if not, do the way you think its better).
But you should have a system. If you define  all transition between tile types by hand, it will jsut be too m uch.

For tile tools, as with other tools, we will have many options:

first is tile category selector, second is tile type:

-Trees: pine, redwood, etc
-Grass: low grass, tall grass
-Ground: sand, cracked dirt, grass, rock,
-Mountain: hill, mountain, etc
-Water: ocean, lake
-And so on.

Also, every tile type should have some variation, added  randomly so not  all of one type looks the same. But they should be seamless  into each other.

The a div, then:
-brush size (drop down slider)
-brush shape (dron down  selector)
-div
-erase
-add
-div
-color A (drop down color selector): 
-color B (drop down color selector)
-color C (drop down color selector)

colors: each tile uses at most 3 paintable colors. black strokes are always black, and some colors might be fixed. Gradients happen, within the color. 
But on the technical side. You sould have  the  info aobut the tiles (images, tech images, whatever you decide to  use) generated in way its colors can be selected and cahnged.

thats it for tile t ools.

Path tools are like paths in stage map or over map. But those paths behaves like a trasure map guide or something.
Here are landscape paths that is OVER the texture.

Example:
-road
-rivers (direction a and b)

They also should have ategory and sub category. The main difference from trasure path we already have is that here is tat multiple surrounding tiles encounter each other, like a road junction or something.
theyu should be paintable too.

and last... objects painter
Categorym and type...
Each object has a size. Do this in a way you can reuse objects in hex type and square type grids.
Like castles, villages, mine entrance, landmarks in general.
The same object can have many variations, decided randomly when placing.

And thats it for map paint... (it know its a lot)

Notice that, for these variations, we dont need ot have the same number of variations of the same asset between styles... this should make things easier.

the colorued sketch style is not a 100% sketch, is more l ike a simple flat colours style. Exampleified on SagaCraft\docs\drafts\barovia.png, but you can create yout own art style here
And the diorama is the octopath traver style graphics.

this is a very hard project. Will take awhile. Do it calmly, test it as you go. Do in parts if needed, commit between parts.
Use the branch feature/map_painter, create it and work on it, we will not follow the directive to work directly on main because many things can go wrong here.

Be very mindful about p rofrmane. Its an online tool and traffic and storage space ARE constraints. And since we will render in browsers, performance too.  So abuse of shaders.



