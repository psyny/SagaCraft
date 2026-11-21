Draft about location features.

As we said, location is a resource. 
Locations are to represent maps. Worldmaps, battelground, any map.

Location can have sub locations.

A new tab at the top will be created for location page.
Locationh page will have new location button. And list all locations with search options:
-Search by name
-toggle for top level location only (locations that are no sub locations of others)
-Or location tags (created by the DM)

Each location can composed of 1 or multiple pictures, that the user can upload and position them in the location. For now, its a tile based map editor. In the fuutre will allow for composition to create battleground and such. But for now only tile by draging the picture around and having some snap options.

Locations can have a images specific for "location icon". Add the app should have a specific control for "icon image size". Because everu resource can have an icon too. Like characters, item, location, or anything that can be visuallu dispayed. So we need to add support for multiple images linked to the same resource. On app controls, beyond image size for each caeogry, we will also add image qty.
For location is easy to think how they play, since we can build a location map composed of many images snaped to each other.
But to characters, for example, we cna have the active character picture, and others to switch as we want.
For item we will usually show the icon when a link is needed, and the image when more details is viewd ( we dont have items yet, but add to the docs this spec)

Grid is an option. With grid size in pixels, to accomotate the image. Grid position to adjust X and Y. Grid physical size, ot give a sense of distance. Grid type: hex or square. No Grid is an option too. Grids should be drawn dinamically. I dont know how, but something performantive enough because grids have a massive amount of elements.
Grid should have display ooptions. Like opacity and color. With color it should allow special cases: "contrast", where it pics back or white at each pixel depending on the underying color. And Inverse, where each pixel of the grid is the inverse color of ites underlying mapcolor.

Theres a FOG option. Where the DM can set tiles of the grid that are visible for each player group. So when the map is displaued on a set or any other part of the software, depending on the role of the loged user (player, dm, etc).
Each tile can have 3 states: unknown, known, visible. How its displayed visually depends on the part of the softwre, on Stages we wil have more cool and animated options. But at the map building: unknown is a black tile, known is th underlying map color but black and white with boundayr grid color between known and visible changed to grey, visible is the map color color. "Painting" the fog reagions should be very easy for teh DM, so we need to add tools for that.

Each grid tile can also have a link for 1 or multiple other resources. And an icon (round style with a good looking border) for the rsource will be displaed on the tile. If multiple resources are linked to a tile, the icons shrink but we show them all. When we have our set, cliking in the icon will take the players to the reosurce.
The resource picker here is a modal that will also be used in other locations. S the modal itself is a component. It should reiceve the possible resource types to display (in the map case: characters, items and locations). And favorites (resources tha willl show at the top). That in the map case: the locations that was selected as sub locations of the current one.

Another feature that the locations is going ot have is "paths". Paths are a list of tiles where order matters. It can represent the journey of the party in a map. A treasure or some instructions. The order of tiles matters because the path can be have many line sttyles for body: dashed, solid, dotted, arrows, arrowhead. Tail: arrow, circle, none. Head: arrow, circle, none. that will compose the line on the map.
We will also want to define how the line is rendered:
-poly: line of the path goes straigh from tile to tile.
-spline: its a spline. between the edge of the tile it enterend (perpenticuar to it), and it exited (perpendicular to it)
the in and out edges of a tile depends on which tile was the previous one.
Path cal laso have color selectable. And which roles can see it.
Edditing paths sould be also easy.

Notice that, a lot of things are attached to the tile. And we canchange grid size over the location, whichi can potentially change the location of things. SO we should resize the grid, when the user changes it, in a way that we add and remove tiles to the end rows of the grid. So we will need an origin (pick one you, can be a corner). But resizing the grid should not be something the user does often. Only as an initial adjusment. Think in a solution for this.

Also, we have a lot of options here. So the locations page for editing a locaiton might need multiple tabs to eedit each one of these features. Think about a good ui and ux for this.

How, for a stage set to display the location.
The stage set for the location are two types: worldmap or localmap.
Worldmap is our current focus. Localmap for now will be just a simple display.
World map set, the DM will select a list of locations that the set will control. Only a location is displayed at a time but switching between them should be easy. A set parameter is: interactive resource. With each rolelisted hhere with a true or false. Meaning, if a user role is allowed to interact with a resource, it will click and go to another map or open the item cahr view of the resource. (we dont have a definition of char view, but it opens the inforative template for the character as a "modal", implement this as parto f this task, and this is also a universal tool for char view, not only map. example: we can open it by clicking a char card on a map set). 
Editing the fog and the paths, and adding resourcers to tiles should be aviable to the DM too here. So the tools you create to edit any location for those should be flexible enough for reuse here. 
As set parameters, the DM should be able to choose how the fog is displayed. Flat style is the same as the location editor. Immersive Static is a fog view were the transition between known, unknown and visible is not flat over the tiles as it is in the locaiton editor. Its a gradiant transition. Visible tiles are always in full display, transiiton happens in teh surrounding itles. Also, no matter the tile type, the transiiton needs to be smoothed so it doesnt look blocky. You will probablu need to play with shaders and meshes here. The immersive animated mode have all that, and also animated a fog, slowly moving fog for the unknown area. fog color and style should be selectable. Think of some. Some are moving animations, soem are a more static texture. Be creative.
Also, as with any other set... the dm should have the option to draw player attention to a tile in the map. So players stage view will center in the tile (or group of tiles) the DM picks. Highlight a tile should also be an option.

remembmer, we are building an app with a concept. Feel free to change some details of all this if you think it bettte attapt to app concenpts. Also, if you think some of whats written here is an evolution of some concept, alter the docs to reflect that. 

And this is a huge implementation, make decisions yourself and we can change later.
