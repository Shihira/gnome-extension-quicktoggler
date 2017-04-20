NAME=gnome-extension-quicktoggler
PO=$(wildcard locale/**/LC_MESSAGES/$(NAME).po)
MO=$(PO:.po=.mo)

.PHONY: all schemas locale update_po install

all: schemas locale

schemas: schemas/gschemas.compiled

locale: $(MO)

uninstall:
	rm -rv ~/.local/share/gnome-shell/extensions/quicktoggler@shihira.github.com || echo

install: uninstall all
	cp -Rv . ~/.local/share/gnome-shell/extensions/quicktoggler@shihira.github.com

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.quicktoggler.gschema.xml
	glib-compile-schemas schemas

update_po: locale/$(NAME).pot
	find . -name \*.po -exec msgmerge -U {} locale/gnome-extension-quicktoggler.pot \;

locale/%/LC_MESSAGES/$(NAME).mo: locale/%/LC_MESSAGES/$(NAME).po
	msgfmt $^ -o `dirname $^`/gnome-extension-quicktoggler.mo

locale/$(NAME).pot: prefs.glade extension.js
	xgettext prefs.glade extension.js -o locale/$(NAME).pot

